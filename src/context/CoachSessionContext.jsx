import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import pb from '../lib/pocketbase';
import {
  clearSelectedClientId,
  getSelectedClientId,
  setSelectedClientId as persistSelectedClientId,
} from '../lib/coachSessionStorage';
import {
  canChangeStatuses,
  canEditPlans,
  canManageExerciseLibrary,
  isTrainer,
} from '../lib/permissions';

const CoachSessionContext = createContext(null);

export function CoachSessionProvider({ children }) {
  const [authUser, setAuthUser] = useState(() => pb.authStore.model);
  const [selectedClientId, setSelectedClientIdState] = useState(() => getSelectedClientId());
  const [selectedClient, setSelectedClient] = useState(null);
  const [trainerLinks, setTrainerLinks] = useState([]);
  const [clientSettings, setClientSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => {
      const next = pb.authStore.model;
      setAuthUser(next);
      if (!next) {
        clearSelectedClientId();
        setSelectedClientIdState(null);
        setSelectedClient(null);
        setTrainerLinks([]);
        setClientSettings(null);
      }
    });
    return unsubscribe;
  }, []);

  const refreshCoachData = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!authUser?.id) {
        if (mounted) {
          setLoading(false);
          setSelectedClient(null);
          setTrainerLinks([]);
          setClientSettings(null);
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);

        if (isTrainer(authUser)) {
          if (!mounted) return;
          setTrainerLinks([]);
          setClientSettings(null);

          if (selectedClientId) {
            try {
              const client = await pb.collection('users').getOne(selectedClientId, {
                requestKey: null,
              });
              if (mounted) setSelectedClient(client);
            } catch (e) {
              console.error('Не удалось загрузить клиента:', e);
              if (mounted) {
                persistSelectedClientId(null);
                setSelectedClientIdState(null);
                setSelectedClient(null);
              }
            }
          } else if (mounted) {
            setSelectedClient(null);
          }
        } else {
          const links = await pb.collection('trainer_clients').getFullList({
            filter: `client = "${authUser.id}"`,
            expand: 'trainer',
            sort: '-created',
            requestKey: null,
          });

          let settings = null;
          try {
            settings = await pb.collection('client_settings').getFirstListItem(
              `performer = "${authUser.id}"`,
              { requestKey: null }
            );
          } catch {
            settings = null;
          }

          if (!mounted) return;
          setTrainerLinks(links || []);
          setClientSettings(settings);
          setSelectedClient(null);
        }
      } catch (e) {
        console.error('Ошибка загрузки coach session:', e);
        if (mounted) setError('Не удалось загрузить данные тренера/клиента');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [authUser?.id, authUser?.role, selectedClientId, reloadKey]);

  const selectClient = useCallback((clientId) => {
    persistSelectedClientId(clientId);
    setSelectedClientIdState(clientId || null);
  }, []);

  const clearClient = useCallback(() => {
    persistSelectedClientId(null);
    setSelectedClientIdState(null);
    setSelectedClient(null);
  }, []);

  const isTrainerView = isTrainer(authUser) && Boolean(selectedClientId);
  const effectiveUserId = isTrainerView ? selectedClientId : authUser?.id || null;
  const trainerLinkCount = trainerLinks.length;
  const clientCanEditPlans = clientSettings?.client_can_edit_plans === true;

  const permissions = useMemo(
    () => ({
      canEditPlans: canEditPlans({
        authUser,
        trainerLinkCount,
        clientCanEditPlans,
      }),
      canManageExerciseLibrary: canManageExerciseLibrary({ authUser }),
      canChangeStatuses: canChangeStatuses({ authUser }),
      isTrainerView,
      isCoached: !isTrainer(authUser) && trainerLinkCount > 0,
    }),
    [authUser, trainerLinkCount, clientCanEditPlans]
  );

  const value = useMemo(
    () => ({
      authUser,
      role: authUser?.role || 'performer',
      effectiveUserId,
      selectedClientId,
      selectedClient,
      trainerLinks,
      clientSettings,
      clientCanEditPlans,
      loading,
      error,
      selectClient,
      clearClient,
      refreshCoachData,
      ...permissions,
    }),
    [
      authUser,
      effectiveUserId,
      selectedClientId,
      selectedClient,
      trainerLinks,
      clientSettings,
      clientCanEditPlans,
      loading,
      error,
      selectClient,
      clearClient,
      refreshCoachData,
      permissions,
    ]
  );

  return <CoachSessionContext.Provider value={value}>{children}</CoachSessionContext.Provider>;
}

export function useCoachSession() {
  const ctx = useContext(CoachSessionContext);
  if (!ctx) {
    throw new Error('useCoachSession must be used within CoachSessionProvider');
  }
  return ctx;
}
