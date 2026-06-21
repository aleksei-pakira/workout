import { useCallback, useMemo, useState } from 'react';
import pb from '../lib/pocketbase';

export function useExerciseDropdownSource(effectiveUserId) {
  const authUser = pb.authStore.model;
  const userId = effectiveUserId || authUser?.id;

  const [exerciseSource, setExerciseSource] = useState('mine'); // mine | public | custom
  const [myExercises, setMyExercises] = useState([]);
  const [publicExercises, setPublicExercises] = useState([]);
  const [customExercises, setCustomExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadMyExercises = useCallback(async () => {
    if (!userId) return [];

    const [created, links] = await Promise.all([
      pb.collection('exercises').getFullList({
        filter: `created_by = "${userId}"`,
        sort: 'exercise_name',
        requestKey: null,
      }),
      pb.collection('user_exercise_library').getFullList({
        filter: `user = "${userId}"`,
        expand: 'exercise',
        requestKey: null,
      }),
    ]);

    const byId = new Map();

    for (const ex of created || []) {
      if (ex?.id) byId.set(ex.id, ex);
    }

    for (const link of links || []) {
      const ex = link?.expand?.exercise || null;
      if (ex?.id) byId.set(ex.id, ex);
    }

    return Array.from(byId.values()).sort((a, b) =>
      String(a?.exercise_name || '')
        .toLowerCase()
        .localeCompare(String(b?.exercise_name || '').toLowerCase())
    );
  }, [userId]);

  const loadPublicExercises = useCallback(async () => {
    const list = await pb.collection('exercises').getFullList({
      filter: 'is_public = true',
      sort: 'exercise_name',
      requestKey: null,
    });
    return list || [];
  }, []);

  const loadCustomExercises = useCallback(async () => {
    if (!userId) return [];

    const list = await pb.collection('custom_exercises').getFullList({
      filter: `user = "${userId}"`,
      sort: 'custom_exercise_name',
      requestKey: null,
    });
    return list || [];
  }, [userId]);

  const ensureLoaded = useCallback(async () => {
    if (loading) return;
    if (myExercises.length > 0 && publicExercises.length > 0 && customExercises.length > 0) return;

    try {
      setLoading(true);
      setError(null);

      const [nextMy, nextPublic, nextCustom] = await Promise.all([
        myExercises.length ? Promise.resolve(null) : loadMyExercises(),
        publicExercises.length ? Promise.resolve(null) : loadPublicExercises(),
        customExercises.length ? Promise.resolve(null) : loadCustomExercises(),
      ]);

      if (nextMy) setMyExercises(nextMy);
      if (nextPublic) setPublicExercises(nextPublic);
      if (nextCustom) setCustomExercises(nextCustom);
    } catch (e) {
      console.error('Ошибка загрузки упражнений:', e);
      setError('Не удалось загрузить упражнения');
    } finally {
      setLoading(false);
    }
  }, [
    loadCustomExercises,
    loadMyExercises,
    loadPublicExercises,
    loading,
    customExercises.length,
    myExercises.length,
    publicExercises.length,
  ]);

  const visibleExercises = useMemo(() => {
    if (exerciseSource === 'custom') {
      return (customExercises || []).map((item) => ({ ...item, kind: 'custom' }));
    }
    const list = exerciseSource === 'mine' ? myExercises : publicExercises;
    return (list || []).map((item) => ({ ...item, kind: 'classic' }));
  }, [exerciseSource, customExercises, myExercises, publicExercises]);

  return {
    exerciseSource,
    setExerciseSource,
    myExercises,
    publicExercises,
    customExercises,
    visibleExercises,
    loading,
    error,
    ensureLoaded,
    loadCustomExercises,
  };
}
