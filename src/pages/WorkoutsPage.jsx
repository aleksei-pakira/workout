import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';
import Header from '../components/layout/Header';
import WorkoutCard from '../components/workouts/WorkoutCard';
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

function toDayKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTodayKey() {
  return toDayKey(new Date());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDayTitleRu(date) {
  return date.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' });
}

function WorkoutsPage() {
  const navigate = useNavigate();
  const user = pb.authStore.model;

  const currentYear = new Date().getFullYear();

  // Правая колонка: “папки” месяцев текущего года + архив годов
  const [selectedMonthKey, setSelectedMonthKey] = useState(null); // подсветка/запоминание
  const [openMonthKey, setOpenMonthKey] = useState(null); // реально раскрытый месяц (тренировки)
  const [openArchive, setOpenArchive] = useState(false);
  const [openArchiveYear, setOpenArchiveYear] = useState(null);

  const [historyYear, setHistoryYear] = useState(String(currentYear));
  const [historyMonthKey, setHistoryMonthKey] = useState(toMonthKey(new Date().toISOString()));

  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');

  const normalizedSearch = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const historyWorkouts = useMemo(() => {
    if (!normalizedSearch) return workouts;
    return workouts.filter((w) => {
      const t = (w.title || '').toLowerCase();
      const n = (w.notes || '').toLowerCase();
      return t.includes(normalizedSearch) || n.includes(normalizedSearch);
    });
  }, [workouts, normalizedSearch]);

  const todayKey = getTodayKey();

  const todayWorkouts = useMemo(() => {
    return workouts
      .filter((w) => toDayKey(w.date) === todayKey)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [workouts, todayKey]);

  const weekGroups = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(base, i);
      const key = toDayKey(date);
      return {
        key,
        date,
        title: formatDayTitleRu(date),
        workouts: [],
      };
    });

    const map = new Map(days.map((d) => [d.key, d]));

    for (const w of workouts) {
      const k = toDayKey(w.date);
      const bucket = map.get(k);
      if (bucket) bucket.workouts.push(w);
    }

    for (const d of days) {
      d.workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    return days;
  }, [workouts]);

  // Левая колонка (как на HomePage)
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    weeklyWorkouts: 0,
    bestWeight: 0,
    favoriteExercise: '—',
  });
  const [avatar, setAvatar] = useState(null);
  const [uploading, setUploading] = useState(false);

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
            setAvatar(pb.files.getURL(user, user.avatar));
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
      setAvatar(pb.files.getURL(updated, updated.avatar));
    } catch (error) {
      console.error('Ошибка загрузки фото:', error);
      alert('Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  };

  const monthsCurrentYear = useMemo(() => {
    const map = new Map();

    for (const w of historyWorkouts) {
      const y = toYear(w.date);
      if (y !== currentYear) continue;

      const key = toMonthKey(w.date);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, { key, title: formatMonthTitleRu(w.date), workouts: [] });
      }
      map.get(key).workouts.push(w);
    }

    // сортируем месяцы по ключу YYYY-MM возрастанию
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [historyWorkouts, currentYear]);

  const archiveYears = useMemo(() => {
    // years < currentYear
    const yearsMap = new Map();

    for (const w of historyWorkouts) {
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
          return Array.from(monthsMap.values()).sort((a, b) => a.key.localeCompare(b.key));
        })(),
      }))
      .sort((a, b) => b.year - a.year);
  }, [historyWorkouts, currentYear]);

  const historyYearsOptions = useMemo(() => {
    const years = new Set();
    for (const w of historyWorkouts) {
      const y = toYear(w.date);
      if (y) years.add(y);
    }
    // новые сверху
    return Array.from(years).sort((a, b) => b - a);
  }, [historyWorkouts]);

  const historyMonthsForYear = useMemo(() => {
    const y = parseInt(historyYear, 10);
    if (!Number.isFinite(y)) return [];

    const map = new Map();
    for (const w of historyWorkouts) {
      const wy = toYear(w.date);
      if (wy !== y) continue;
      const key = toMonthKey(w.date);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, title: formatMonthTitleRu(w.date) });
    }
    // ранние сверху, поздние снизу
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [historyWorkouts, historyYear]);

  useEffect(() => {
    if (!historyMonthsForYear.length) return;
    const exists = historyMonthsForYear.some((m) => m.key === historyMonthKey);
    if (exists) return;
    // берём самый поздний доступный месяц (последний в asc)
    setHistoryMonthKey(historyMonthsForYear[historyMonthsForYear.length - 1].key);
  }, [historyMonthsForYear, historyMonthKey]);

  const historyWorkoutsForSelectedMonth = useMemo(() => {
    if (!historyMonthKey) return [];
    return historyWorkouts
      .filter((w) => toMonthKey(w.date) === historyMonthKey)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [historyWorkouts, historyMonthKey]);

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
                <div className={styles.avatar}>{user?.email?.[0]?.toUpperCase?.() || '👤'}</div>

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
              >
                {avatar && <img className={styles.photoImg} src={avatar} alt="" />}
                {!avatar && (
                  <>
                    <div className={styles.photoIcon}>📷</div>
                    <div className={styles.photoText}>{uploading ? '⏳ Загрузка...' : 'Загрузить фото'}</div>
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
                  className={styles.hiddenInput}
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

          {/* Правая колонка */}
          <div className={styles.rightColumn}>
            <div className={styles.todaySection}>
              <div className={styles.todayHeader}>
                <h2 className={styles.todayTitle}>Сегодня</h2>
                <div className={styles.todayMeta}>{todayWorkouts.length}</div>
              </div>

              {todayWorkouts.length > 0 ? (
                <div className={styles.todayList}>
                  {todayWorkouts.map((w) => (
                    <WorkoutCard
                      key={w.id}
                      workout={w}
                      classes={styles}
                      onOpen={() => navigate(`/workouts/${w.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.todayEmptyState}>
                  На сегодня тренировок нет.
                  <button
                    type="button"
                    className={styles.todayEmptyBtn}
                    onClick={() => navigate('/workouts/create')}
                  >
                    Создать
                  </button>
                </div>
              )}
            </div>

            <div className={styles.weekSection}>
              <div className={styles.weekHeader}>
                <h2 className={styles.weekTitle}>Неделя</h2>
                <div className={styles.weekMeta}>{weekGroups.reduce((s, d) => s + d.workouts.length, 0)}</div>
              </div>

              <div className={styles.weekList}>
                {weekGroups.map((d) => (
                  <div key={d.key} className={styles.dayGroup}>
                    <div className={styles.dayHeader}>
                      <div className={styles.dayTitle}>{d.title}</div>
                      <div className={styles.dayCount}>{d.workouts.length}</div>
                    </div>

                    {d.workouts.length > 0 ? (
                      <div className={styles.dayList}>
                        {d.workouts.map((w) => (
                          <WorkoutCard
                            key={w.id}
                            workout={w}
                            classes={styles}
                            onOpen={() => navigate(`/workouts/${w.id}`)}
                          />
                        ))}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.dayEmptyBtn}
                        onClick={() => navigate(`/workouts/create?date=${encodeURIComponent(d.key)}`)}
                      >
                        Создать
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.searchBar}>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Поиск по тренировкам (название/заметки)…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <button type="button" className={styles.planWeekBtn} onClick={() => navigate('/workouts/plan')}>
                План недели
              </button>

              {searchQuery.trim() && (
                <button type="button" className={styles.searchClearBtn} onClick={() => setSearchQuery('')}>
                  Очистить
                </button>
              )}
            </div>

            <div className={styles.historyHeader}>
              <h2 className={styles.historyTitle}>История</h2>
            </div>

            <div className={styles.historyMobile}>
              <div className={styles.historyFiltersRow}>
                <select className={styles.historySelect} value={historyYear} onChange={(e) => setHistoryYear(e.target.value)}>
                  {historyYearsOptions.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>

                <select
                  className={styles.historySelect}
                  value={historyMonthKey || ''}
                  onChange={(e) => setHistoryMonthKey(e.target.value)}
                >
                  {historyMonthsForYear.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              {historyWorkoutsForSelectedMonth.length > 0 ? (
                <div className={styles.historyMonthList}>
                  {historyWorkoutsForSelectedMonth.map((w) => (
                    <WorkoutCard key={w.id} workout={w} classes={styles} onOpen={() => navigate(`/workouts/${w.id}`)} />
                  ))}
                </div>
              ) : (
                <div className={styles.historyEmpty}>Нет тренировок за выбранный месяц</div>
              )}
            </div>

            {/* Десктопная “папочная” история и архив остаются ниже (и скрываются на мобиле CSS) */}
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>📁 {currentYear}</h2>
            </div>

            {monthsCurrentYear.length > 0 ? (
              <>
                <div className={styles.historyFoldersGrid}>
                  {monthsCurrentYear.map((m) => (
                    <div
                      key={m.key}
                      className={styles.workoutFolder}
                      onClick={() => setOpenMonthKey((prev) => (prev === m.key ? null : m.key))}
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

                {openMonthKey && (
                  <div className={styles.monthContent}>
                    <div className={styles.sectionHeader}>
                      <h2 className={styles.sectionTitle}>📁 Тренировки</h2>
                    </div>
                    <div className={styles.monthWorkoutsList}>
                      {(monthsCurrentYear.find((x) => x.key === openMonthKey)?.workouts || []).map((w) => (
                        <WorkoutCard key={w.id} workout={w} classes={styles} onOpen={() => navigate(`/workouts/${w.id}`)} />
                      ))}
                    </div>
                  </div>
                )}

                {archiveYears.length > 0 && (
                  <div className={styles.archiveSection}>
                    <button type="button" className={styles.archiveToggle} onClick={() => setOpenArchive((v) => !v)}>
                      📦 Архив
                      <span className={styles.metaPill}>{archiveYears.reduce((s, y) => s + y.total, 0)}</span>
                    </button>

                    {openArchive && (
                      <div className={styles.archiveYears}>
                        <div className={styles.historyFoldersGrid}>
                          {archiveYears.map((y) => (
                            <div
                              key={y.year}
                              className={styles.workoutFolder}
                              onClick={() => setOpenArchiveYear((prev) => (prev === y.year ? null : y.year))}
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

                            <div className={styles.historyFoldersGrid}>
                              {archiveYears
                                .find((x) => x.year === openArchiveYear)
                                ?.months.map((m) => (
                                  <div
                                    key={m.key}
                                    className={styles.workoutFolder}
                                    onClick={() => {
                                      setSelectedMonthKey(m.key);
                                      setOpenMonthKey(m.key);
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
                <p className={styles.emptyText}>Создайте свою первую тренировку, чтобы начать отслеживать прогресс</p>
                <button type="button" onClick={() => navigate('/workouts/create')} className={styles.emptyBtn}>
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
