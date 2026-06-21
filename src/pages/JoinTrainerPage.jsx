import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import { markCoachJoinNoticeSeen } from '../lib/coachSessionStorage';
import { useCoachSession } from '../hooks/useCoachSession';
import styles from './JoinTrainerPage.module.css';

function JoinTrainerPage() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const { authUser, refreshCoachData } = useCoachSession();
  const [manualCode, setManualCode] = useState(codeParam || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleJoin = async (e) => {
    e?.preventDefault();
    const inviteCode = (manualCode || codeParam || '').trim();
    if (!inviteCode) {
      setError('Введите код тренера');
      return;
    }
    if (!authUser?.id) {
      navigate(`/login?redirect=${encodeURIComponent(`/join/${inviteCode}`)}`);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const trainer = await pb.collection('users').getFirstListItem(
        `invite_code = "${inviteCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" && role = "trainer"`,
        { requestKey: null }
      );

      const existing = await pb.collection('trainer_clients').getFullList({
        filter: `trainer = "${trainer.id}" && client = "${authUser.id}"`,
        requestKey: null,
      });

      if (existing.length === 0) {
        await pb.collection('trainer_clients').create(
          {
            trainer: trainer.id,
            client: authUser.id,
          },
          { requestKey: null }
        );
      }

      markCoachJoinNoticeSeen();
      refreshCoachData();
      setSuccess(
        'Вы подключились к тренеру. Пока тренер ведёт ваш план, создание и редактирование тренировок недоступно — вы можете отмечать статусы.'
      );
    } catch (err) {
      console.error('Ошибка подключения к тренеру:', err);
      setError('Не удалось подключиться. Проверьте код и попробуйте снова.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        <h1 className={styles.title}>Подключение к тренеру</h1>

        {success ? (
          <div className={styles.successBox}>
            <p>{success}</p>
            <button type="button" className={styles.primaryBtn} onClick={() => navigate('/workouts/calendar')}>
              Перейти к календарю
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleJoin}>
            <label className={styles.label}>
              Код приглашения
              <input
                className={styles.input}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="TRN-IVAN01"
                disabled={loading}
              />
            </label>
            {error ? <div className={styles.error}>{error}</div> : null}
            <button type="submit" className={styles.primaryBtn} disabled={loading}>
              {loading ? 'Подключаем…' : 'Подключиться'}
            </button>
          </form>
        )}

        <p className={styles.hint}>
          Нет кода? <Link to="/">На главную</Link>
        </p>
      </div>
    </div>
  );
}

export default JoinTrainerPage;
