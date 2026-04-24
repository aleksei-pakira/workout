import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';
import Header from '../components/layout/Header';
import WorkoutDetailContent from '../components/workouts/WorkoutDetailContent';
import styles from './WorkoutsPage.module.css';

function toYear(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

function toMonthKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonthTitleRu(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Без даты';
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function WorkoutsPage() {
  const navigate = useNavigate();
  const user = pb.authStore.model;

  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState([]);

  // Левая колонка (как на HomePage)
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    weeklyWorkouts: 0,
    bestWeight: 0,
    favoriteExercise: '—',
  });
  const [avatar, setAvatar] = useState(null);
  const [uploading, setUploading] = useState(false);

// Правая колонка: “папки” месяцев текущего года + архив годов
const [selectedMonthKey, setSelectedMonthKey] = useState(null); // подсветка/запоминание
const [openMonthKey, setOpenMonthKey] = useState(null);         // реально раскрытый месяц (тренировки)
const [openArchive, setOpenArchive] = useState(false);
const [openArchiveYear, setOpenArchiveYear] = useState(null);
const [openWorkoutId, setOpenWorkoutId] = useState(null);

  const workoutCardRefs = useRef({});
  const monthGridRef = useRef(null);
  const [monthGridCols, setMonthGridCols] = useState(3);

  const readCols = useCallback(() => {
    const el = monthGridRef.current;
    if (!el) return;
    const raw = getComputedStyle(el).getPropertyValue('--cols').trim();
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) setMonthGridCols(parsed);
  }, []);

  useEffect(() => {
    readCols();
    window.addEventListener('resize', readCols);
    return () => window.removeEventListener('resize', readCols);
  }, [readCols]);

  useEffect(() => {
    if (!openMonthKey) return;
    const raf = requestAnimationFrame(() => readCols());
    return () => cancelAnimationFrame(raf);
  }, [openMonthKey, readCols]);

  useEffect(() => {
    if (!openWorkoutId) return;
    const el = workoutCardRefs.current?.[openWorkoutId];
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      el.focus?.();
    }, 0);
    return () => clearTimeout(t);
  }, [openWorkoutId]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const records = await pb.collection('workouts').getFullList({
          filter: user?.id ? `user = "${user.id}"` : '',
          sort: '-date',
          requestKey: null,
        });

        setWorkouts(records);

        // Статы (быстро, без N+1 запросов)
        const total = records.length;

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekly = records.filter((w) => new Date(w.date) >= weekAgo).length;

        setStats({
          totalWorkouts: total,
          weeklyWorkouts: weekly,
          bestWeight: 0,
          favoriteExercise: '—',
        });

        // Выбираем текущий месяц по умолчанию, но не раскрываем список тренировок
        setSelectedMonthKey(toMonthKey(new Date().toISOString()));
        setOpenMonthKey(null);

        // если у user есть avatar
        if (user?.avatar) {
          try {
            setAvatar(pb.files.getUrl(user, user.avatar));
          } catch {
            // ignore
          }
        }
      } catch (e) {
        console.error('Ошибка загрузки тренировок:', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой. Максимальный размер 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      setUploading(true);
      const updated = await pb.collection('users').update(user.id, formData, { requestKey: null });
      setAvatar(pb.files.getUrl(updated, updated.avatar));
    } catch (error) {
      console.error('Ошибка загрузки фото:', error);
      alert('Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  };

  const monthsCurrentYear = useMemo(() => {
    const map = new Map();

    for (const w of workouts) {
      const y = toYear(w.date);
      if (y !== currentYear) continue;

      const key = toMonthKey(w.date);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, { key, title: formatMonthTitleRu(w.date), workouts: [] });
      }
      map.get(key).workouts.push(w);
    }

    // сортируем месяцы по ключу YYYY-MM убыванию
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [workouts, currentYear]);

  const archiveYears = useMemo(() => {
    // years < currentYear
    const yearsMap = new Map();

    for (const w of workouts) {
      const y = toYear(w.date);
      if (!y || y >= currentYear) continue;

      if (!yearsMap.has(y)) {
        yearsMap.set(y, []);
      }
      yearsMap.get(y).push(w);
    }

    return Array.from(yearsMap.entries())
      .map(([year, list]) => ({
        year,
        total: list.length,
        months: (() => {
          const monthsMap = new Map();
          for (const w of list) {
            const key = toMonthKey(w.date);
            if (!key) continue;
            if (!monthsMap.has(key)) {
              monthsMap.set(key, { key, title: formatMonthTitleRu(w.date), workouts: [] });
            }
            monthsMap.get(key).workouts.push(w);
          }
          return Array.from(monthsMap.values()).sort((a, b) => b.key.localeCompare(a.key));
        })(),
      }))
      .sort((a, b) => b.year - a.year);
  }, [workouts, currentYear]);

  const quote = useMemo(
    () => ({
      text: 'Сила приходит не от побед. Силу рождает борьба.',
      author: 'Арнольд Шварценеггер',
    }),
    []
  );

  if (loading) {
    return (
      <>
        <Header />
        <div className={styles.loading}>Загрузка тренировок...</div>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.content}>
        <div className={styles.grid}>
          {/* Левая колонка: профиль */}
          <div className={styles.leftColumn}>
            <div className={styles.profileCard}>
              <div className={styles.profileHeader}>
                <div className={styles.avatar}>
                  {user?.email?.[0]?.toUpperCase?.() || '👤'}
                </div>

                <div className={styles.userInfoCompact}>
                  <h2 className={styles.userNameCompact}>
                    Привет, {user?.email?.split?.('@')?.[0] || 'пользователь'}!
                  </h2>
                  <p className={styles.userEmailCompact}>{user?.email}</p>
                </div>
              </div>

              <div
                className={styles.photoUploadArea}
                onClick={() => document.getElementById('avatarInputWorkouts')?.click()}
                style={
                  avatar
                    ? {
                        backgroundImage: `url(${avatar})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : {}
                }
              >
                {!avatar && (
                  <>
                    <div className={styles.photoIcon}>📷</div>
                    <div className={styles.photoText}>
                      {uploading ? '⏳ Загрузка...' : 'Загрузить фото'}
                    </div>
                    <div className={styles.photoSubtext}>
                      Нажмите чтобы выбрать изображение
                      <br />
                      (380x380 px)
                    </div>
                  </>
                )}

                <input
                  id="avatarInputWorkouts"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                />
              </div>

              <div className={styles.profileStatsCompact}>
                <div className={styles.statItemCompact}>
                  <div className={styles.statValueCompact}>{stats.totalWorkouts}</div>
                  <div className={styles.statLabelCompact}>тренировок</div>
                </div>

                <div className={styles.statItemCompact}>
                  <div className={styles.statValueCompact}>{stats.weeklyWorkouts}</div>
                  <div className={styles.statLabelCompact}>за неделю</div>
                </div>

                <div className={styles.statItemCompact}>
                  <div className={styles.statValueCompact}>{stats.bestWeight} кг</div>
                  <div className={styles.statLabelCompact}>макс. вес</div>
                </div>

                <div className={styles.statItemCompact}>
                  <div className={styles.statValueCompact}>{stats.favoriteExercise}</div>
                  <div className={styles.statLabelCompact}>любимое</div>
                </div>
              </div>

              <div className={styles.quickActionsCompact}>
                <button
                  type="button"
                  onClick={() => navigate('/workouts/create')}
                  className={styles.quickActionBtnPrimaryCompact}
                >
                  Создать тренировку
                </button>
              </div>
            </div>

            <div className={styles.quoteCardCompact}>
              <p className={styles.quoteTextCompact}>"{quote.text}"</p>
              <p className={styles.quoteAuthorCompact}>— {quote.author}</p>
            </div>
          </div>

          {/* Правая колонка: папки месяцев текущего года + архив прошлых лет */}
          <div className={styles.rightColumn}>
            <div className={styles.mobileActions}>
              <button
                type="button"
                className={styles.mobileCreateBtn}
                onClick={() => navigate('/workouts/create')}
              >
                Создать тренировку
              </button>
            </div>

            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>📁 {currentYear}</h2>
            </div>

            {monthsCurrentYear.length > 0 ? (
              <>
                {/* Папки месяцев текущего года */}
                <div className={styles.workoutsGrid}>
                  {monthsCurrentYear.map((m) => (
                    <div
                      key={m.key}
                      className={styles.workoutFolder}
                      onClick={() => {
                        setOpenWorkoutId(null);
                        setOpenMonthKey((prev) => (prev === m.key ? null : m.key));
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={styles.folderIcon}>📁</div>
                      <h3 className={styles.folderTitle}>{m.title}</h3>

                      <div className={styles.folderStats}>
                        <span className={styles.folderStat}>
                          <span className={styles.folderStatIcon}>📄</span>
                          {m.workouts.length}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Раскрытый месяц: тренировки внутри (как HomePage папки) */}
                {openMonthKey && (
                  <div className={styles.monthContent}>
                    <div className={styles.sectionHeader}>
                      <h2 className={styles.sectionTitle}>📁 Тренировки</h2>
                    </div>

                    {(() => {
                      const monthWorkouts =
                        monthsCurrentYear.find((x) => x.key === openMonthKey)?.workouts || [];

                      const openIdx = openWorkoutId
                        ? monthWorkouts.findIndex((w) => w.id === openWorkoutId)
                        : -1;

                      const cols = monthGridCols || 3;
                      const rowEndIndex =
                        openIdx >= 0
                          ? Math.min(
                              monthWorkouts.length - 1,
                              (Math.floor(openIdx / cols) + 1) * cols - 1
                            )
                          : -1;

                      return (
                        <div className={styles.workoutsGrid} ref={monthGridRef}>
                          {monthWorkouts.map((workout, idx) => (
                          <Fragment key={workout.id}>
                            <div
                              ref={(el) => {
                                if (el) workoutCardRefs.current[workout.id] = el;
                              }}
                              className={styles.workoutFolder}
                              onClick={() =>
                                setOpenWorkoutId((prev) => (prev === workout.id ? null : workout.id))
                              }
                              role="button"
                              tabIndex={0}
                            >
                              <div className={styles.folderIcon}>📁</div>

                              <h3 className={styles.folderTitle}>
                                {workout.title || 'Тренировка'}
                              </h3>

                              <div className={styles.folderDate}>
                                📅 {new Date(workout.date).toLocaleDateString('ru-RU')}
                              </div>

                              <div className={styles.folderStats}>
                                <span className={styles.folderStat}>
                                  {workout.exercises_count || 0}
                                </span>

                                <span className={styles.folderStat}>
                                  <span className={styles.folderStatIcon}>⚡</span>
                                  {workout.total_sets || 0}
                                </span>
                              </div>
                            </div>

                            {openWorkoutId && idx === rowEndIndex && (
                              <div className={styles.inlineWorkoutDetailInGrid}>
                                <WorkoutDetailContent workoutId={openWorkoutId} variant="inline" showMeta={false} />
                              </div>
                            )}
                          </Fragment>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Архив прошлых лет */}
                {archiveYears.length > 0 && (
                  <div className={styles.archiveSection}>
                    <button
                      type="button"
                      className={styles.archiveToggle}
                      onClick={() => setOpenArchive((v) => !v)}
                    >
                      📦 Архив
                      <span className={styles.metaPill}>{archiveYears.reduce((s, y) => s + y.total, 0)}</span>
                    </button>

                    {openArchive && (
                      <div className={styles.archiveYears}>
                        <div className={styles.workoutsGrid}>
                          {archiveYears.map((y) => (
                            <div
                              key={y.year}
                              className={styles.workoutFolder}
                              onClick={() =>
                                setOpenArchiveYear((prev) => (prev === y.year ? null : y.year))
                              }
                              role="button"
                              tabIndex={0}
                            >
                              <div className={styles.folderIcon}>📁</div>
                              <h3 className={styles.folderTitle}>{y.year}</h3>
                              <div className={styles.folderStats}>
                                <span className={styles.folderStat}>
                                  <span className={styles.folderStatIcon}>📄</span>
                                  {y.total}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {openArchiveYear && (
                          <div className={styles.archiveMonths}>
                            <div className={styles.sectionHeader}>
                              <h2 className={styles.sectionTitle}>📁 {openArchiveYear}</h2>
                            </div>

                            <div className={styles.workoutsGrid}>
                              {archiveYears
                                .find((x) => x.year === openArchiveYear)
                                ?.months.map((m) => (
                                  <div
                                    key={m.key}
                                    className={styles.workoutFolder}
                                    onClick={() => {
                                      setSelectedMonthKey(m.key);
                                      setOpenMonthKey(m.key);
                                      setOpenWorkoutId(null);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <div className={styles.folderIcon}>📁</div>
                                    <h3 className={styles.folderTitle}>{m.title}</h3>
                                    <div className={styles.folderStats}>
                                      <span className={styles.folderStat}>
                                        <span className={styles.folderStatIcon}>📄</span>
                                        {m.workouts.length}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.emptyFolder}>
                <div className={styles.emptyIcon}>📁</div>
                <h3 className={styles.emptyTitle}>Нет тренировок</h3>
                <p className={styles.emptyText}>
                  Создайте свою первую тренировку, чтобы начать отслеживать прогресс
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/workouts/create')}
                  className={styles.emptyBtn}
                >
                  ➕ Создать тренировку
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkoutsPage;