import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import { isTrainer } from '../lib/permissions';
import { useCoachSession } from '../hooks/useCoachSession';
import styles from './TrainerClientsPage.module.css';

function TrainerClientsPage() {
  const navigate = useNavigate();
  const { authUser, selectClient, refreshCoachData } = useCoachSession();
  const [links, setLinks] = useState([]);
  const [settingsByPerformer, setSettingsByPerformer] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggleSaving, setToggleSaving] = useState(null);

  useEffect(() => {
    if (!authUser?.id) return;
    if (!isTrainer(authUser)) {
      navigate('/workouts/calendar', { replace: true });
    }
  }, [authUser, navigate]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!authUser?.id || !isTrainer(authUser)) return;

      try {
        setLoading(true);
        setError('');

        const list = await pb.collection('trainer_clients').getFullList({
          filter: `trainer = "${authUser.id}"`,
          expand: 'client',
          sort: '-created',
          requestKey: null,
        });

        const settingsMap = {};
        for (const link of list || []) {
          const performerId = link.client;
          if (!performerId) continue;
          try {
            const settings = await pb.collection('client_settings').getFirstListItem(
              `performer = "${performerId}"`,
              { requestKey: null }
            );
            settingsMap[performerId] = settings;
          } catch {
            settingsMap[performerId] = null;
          }
        }

        if (!mounted) return;
        setLinks(list || []);
        setSettingsByPerformer(settingsMap);
      } catch (e) {
        console.error('Ошибка загрузки клиентов:', e);
        if (mounted) setError('Не удалось загрузить список клиентов');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [authUser?.id, authUser?.role]);

  const openClient = (clientId) => {
    selectClient(clientId);
    navigate('/workouts/calendar');
  };

  const handleToggleEditPlans = async (performerId) => {
    const current = settingsByPerformer[performerId];
    const nextValue = !(current?.client_can_edit_plans === true);

    try {
      setToggleSaving(performerId);
      if (current?.id) {
        const updated = await pb.collection('client_settings').update(
          current.id,
          { client_can_edit_plans: nextValue },
          { requestKey: null }
        );
        setSettingsByPerformer((prev) => ({ ...prev, [performerId]: updated }));
      } else {
        const created = await pb.collection('client_settings').create(
          {
            performer: performerId,
            client_can_edit_plans: nextValue,
          },
          { requestKey: null }
        );
        setSettingsByPerformer((prev) => ({ ...prev, [performerId]: created }));
      }
      refreshCoachData();
    } catch (e) {
      console.error('Ошибка сохранения настройки:', e);
      setError('Не удалось сохранить настройку клиента');
    } finally {
      setToggleSaving(null);
    }
  };

  const inviteCode = authUser?.invite_code || '';
  const joinUrl =
    typeof window !== 'undefined' && inviteCode
      ? `${window.location.origin}/join/${encodeURIComponent(inviteCode)}`
      : '';

  const copyInviteLink = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
    } catch (e) {
      console.error('Не удалось скопировать ссылку:', e);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        <h1 className={styles.title}>Клиенты</h1>

        {inviteCode ? (
          <div className={styles.inviteBox}>
            <div className={styles.inviteLabel}>Ваш код: {inviteCode}</div>
            <button type="button" className={styles.secondaryBtn} onClick={copyInviteLink}>
              Скопировать ссылку приглашения
            </button>
          </div>
        ) : (
          <div className={styles.hint}>
            Код приглашения не задан. Добавьте invite_code в профиле пользователя (Admin).
          </div>
        )}

        {loading ? <div className={styles.muted}>Загрузка…</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {!loading && links.length === 0 ? (
          <div className={styles.empty}>Пока нет подключённых клиентов. Отправьте ссылку приглашения.</div>
        ) : null}

        <ul className={styles.list}>
          {links.map((link) => {
            const client = link.expand?.client;
            const performerId = link.client;
            const settings = settingsByPerformer[performerId];
            const canEdit = settings?.client_can_edit_plans === true;
            const label = client?.name || client?.email || performerId;

            return (
              <li key={link.id} className={styles.card}>
                <div className={styles.cardMain}>
                  <div className={styles.clientName}>{label}</div>
                  <div className={styles.clientEmail}>{client?.email || ''}</div>
                </div>
                <div className={styles.cardActions}>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={canEdit}
                      disabled={toggleSaving === performerId}
                      onChange={() => handleToggleEditPlans(performerId)}
                    />
                    <span>Клиент сам редактирует план</span>
                  </label>
                  <button type="button" className={styles.primaryBtn} onClick={() => openClient(performerId)}>
                    Открыть календарь
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className={styles.backLink}>
          <Link to="/workouts/calendar">← К календарю</Link>
        </p>
      </div>
    </div>
  );
}

export default TrainerClientsPage;
