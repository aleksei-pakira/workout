import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';
import Header from '../components/layout/Header';
import styles from './WorkoutPlanPage.module.css';

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayTitleRu(date) {
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' });
}

function WorkoutPlanPage() {
  const navigate = useNavigate();
  const user = pb.authStore.model;

  const [weekOffset, setWeekOffset] = useState(0); // 0=this week, 1=next week
  const [selected, setSelected] = useState(() => new Set());
  const [creating, setCreating] = useState(false);
  const [baseTitle, setBaseTitle] = useState('');
  const [lastReport, setLastReport] = useState(null); // { created, skipped, total } | null

  const base = useMemo(() => {
    const monday = startOfWeekMonday(new Date());
    monday.setDate(monday.getDate() + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(base, i);
      return {
        key: toDayKey(date),
        title: formatDayTitleRu(date),
      };
    });
  }, [base]);

  const toggleDay = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(days.map((d) => d.key)));
  const clearAll = () => setSelected(new Set());

  const createSelected = async () => {
    if (!user?.id) {
      alert('Нужно войти в аккаунт');
      return;
    }

    const keys = Array.from(selected);
    if (keys.length === 0) return;
    const baseName = baseTitle.trim() || 'Тренировка';

    try {
      setCreating(true);
      setLastReport(null);

      let created = 0;
      let skipped = 0;

      for (const dateKey of keys) {
        let exists = false;
        try {
          await pb.collection('workouts').getFirstListItem(
            `user = "${user.id}" && date = "${dateKey}"`,
            { requestKey: null }
          );
          exists = true;
        } catch (e) {
          if (e?.status === 404) exists = false;
          else throw e;
        }

        if (exists) {
          skipped += 1;
          continue;
        }

        await pb.collection('workouts').create(
          {
            user: user.id,
            title: `${baseName} ${dateKey}`,
            date: dateKey,
            notes: '',
          },
          { requestKey: null }
        );
        created += 1;
      }

      setLastReport({ created, skipped, total: keys.length });
      alert(`Готово. Создано: ${created}, пропущено: ${skipped}.`);
      navigate('/workouts');
    } catch (e) {
      console.error('Ошибка создания тренировок:', e);
      alert('Не удалось создать тренировки: ' + (e?.message || e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.content}>
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <h1 className={styles.title}>План недели</h1>
            <p className={styles.subtitle}>Создавай тренировки на нужные даты заранее.</p>
          </div>

          <button type="button" className={styles.backBtn} onClick={() => navigate('/workouts')}>
            ← К тренировкам
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.weekToggle}>
            <button
              type="button"
              className={weekOffset === 0 ? styles.weekToggleBtnActive : styles.weekToggleBtn}
              onClick={() => setWeekOffset(0)}
            >
              Эта неделя
            </button>
            <button
              type="button"
              className={weekOffset === 1 ? styles.weekToggleBtnActive : styles.weekToggleBtn}
              onClick={() => setWeekOffset(1)}
            >
              Следующая
            </button>
          </div>

          <div className={styles.baseTitle}>
            <div className={styles.baseTitleLabel}>Базовое название</div>
            <input
              className={styles.baseTitleInput}
              value={baseTitle}
              onChange={(e) => setBaseTitle(e.target.value)}
              placeholder="Напр. Push / Pull / Legs"
              disabled={creating}
            />
            <div className={styles.baseTitleHint}>
              Будет: «{(baseTitle.trim() || 'Тренировка')} YYYY-MM-DD»
            </div>
          </div>

          <div className={styles.bulkActions}>
            <button type="button" className={styles.bulkBtn} onClick={selectAll} disabled={creating}>
              Выбрать все
            </button>
            <button type="button" className={styles.bulkBtn} onClick={clearAll} disabled={creating}>
              Снять
            </button>
            <button
              type="button"
              className={styles.bulkBtnPrimary}
              onClick={createSelected}
              disabled={creating || selected.size === 0}
            >
              {creating ? 'Создаю…' : `Создать выбранные (${selected.size})`}
            </button>
          </div>
        </div>

        {lastReport && (
          <div className={styles.report}>
            Создано: <b>{lastReport.created}</b>, пропущено (уже было): <b>{lastReport.skipped}</b>
          </div>
        )}

        <div className={styles.weekCard}>
          {days.map((d) => (
            <div key={d.key} className={styles.dayRow}>
              <label className={styles.daySelect}>
                <input
                  type="checkbox"
                  checked={selected.has(d.key)}
                  onChange={() => toggleDay(d.key)}
                />
              </label>

              <div className={styles.dayInfo}>
                <div className={styles.dayTitle}>{d.title}</div>
                <div className={styles.dayKey}>{d.key}</div>
              </div>

              <button
                type="button"
                className={styles.createBtn}
                onClick={() => navigate(`/workouts/create?date=${encodeURIComponent(d.key)}`)}
                disabled={creating}
              >
                Создать
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WorkoutPlanPage;
