// src/pages/HomePage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import styles from './HomePage.module.css';

function HomePage() {
  const navigate = useNavigate();
  const user = pb.authStore.model;
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    weeklyWorkouts: 0,
    bestWeight: 0,
    favoriteExercise: '—'
  });
  const [recentWorkouts, setRecentWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const syncAvatar = () => {
      const u = pb.authStore.model;
      if (u?.avatar) setAvatar(pb.files.getUrl(u, u.avatar));
      else setAvatar(null);
    };
  
    // 1) синхронизация сразу при монтировании
    syncAvatar();
  
    // 2) синхронизация при любых изменениях authStore
    const unsubscribe = pb.authStore.onChange(() => {
      syncAvatar();
    });
  
    return unsubscribe;
  }, []);

  const loadDashboardData = async () => {
    try {
      const { items: workouts } = await pb.collection('workouts').getList(1, 10, {
        filter: `user = "${user.id}"`,
        sort: '-date',
        requestKey: null,
      });

      const totalWorkouts = workouts.length;

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weeklyWorkouts = workouts.filter(w =>
        new Date(w.date) >= weekAgo
      ).length;

      let bestWeight = 0;
      const exerciseCount = {};

      for (const workout of workouts.slice(0, 5)) {
        const exercises = await pb.collection('workout_exercises').getFullList({
          filter: `workout = "${workout.id}"`,
          expand: 'exercise',
          requestKey: null
        });

        for (const ex of exercises) {
          const exName = ex.expand?.exercise?.exercise_name || ex.custom_name;
          if (exName) {
            exerciseCount[exName] = (exerciseCount[exName] || 0) + 1;
          }

          const sets = await pb.collection('sets').getFullList({
            filter: `workout_exercise = "${ex.id}"`,
            requestKey: null
          });

          for (const set of sets) {
            if (set.weight > bestWeight) {
              bestWeight = set.weight;
            }
          }
        }
      }

      let favoriteExercise = '—';
      let maxCount = 0;
      for (const [name, count] of Object.entries(exerciseCount)) {
        if (count > maxCount) {
          maxCount = count;
          favoriteExercise = name;
        }
      }

      setStats({
        totalWorkouts,
        weeklyWorkouts,
        bestWeight,
        favoriteExercise
      });

      setRecentWorkouts(workouts);

    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
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

  const quotes = [
    { text: "Сила приходит не от побед. Силу рождает борьба.", author: "Арнольд Шварценеггер" },
    { text: "Нет боли — нет результата.", author: "Джейн Фонда" },
    { text: "Тело достигает того, во что верит разум.", author: "unknown" }
  ];
  const todayQuote = quotes[new Date().getDay() % quotes.length];

  const getFolderColor = (index) => {
    const colors = [styles.folderBlue, styles.folderGreen, styles.folderOrange, styles.folderPurple];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className={styles.content}>
          <div className={styles.loading}>⏳ Загрузка...</div>
        </div>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.content}>
        <div className={styles.grid}>

          {/* Левая колонка */}
          <div className={styles.leftColumn}>
            {/* Карточка профиля с фото */}
            <div className={styles.profileCard}>
              {/* Верхняя часть - аватар и имя */}
              <div className={styles.profileHeader}>
                <div className={styles.avatar}>
                  {user?.email?.[0].toUpperCase() || '👤'}
                </div>
                <div className={styles.userInfoCompact}>
                  <h2 className={styles.userNameCompact}>
                    Привет, {user?.email?.split('@')[0] || 'пользователь'}!
                  </h2>
                  <p className={styles.userEmailCompact}>{user?.email}</p>
                </div>
              </div>

              {/* Место для загрузки фото */}
              <div
                className={styles.photoUploadArea}
                onClick={() => document.getElementById('avatarInput').click()}
                style={avatar ? { backgroundImage: `url(${avatar})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
              >
                {!avatar && (
                  <>
                    <div className={styles.photoIcon}>📷</div>
                    <div className={styles.photoText}>
                      {uploading ? '⏳ Загрузка...' : 'Загрузить фото'}
                    </div>
                    <div className={styles.photoSubtext}>
                      Нажмите чтобы выбрать изображение<br />(380x380 px)
                    </div>
                  </>
                )}
                {avatar && (
                  <div className={styles.photoOverlay}>
                    <span className={styles.photoOverlayText}>Изменить фото</span>
                  </div>
                )}
                <input
                  id="avatarInput"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Компактная статистика */}
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

              {/* Быстрые действия */}
              <div className={styles.quickActionsCompact}>
                <button
                  onClick={() => navigate('/workouts/create')}
                  className={styles.quickActionBtnPrimaryCompact}
                >
                  ➕ Новая
                </button>
              </div>
            </div>

            {/* Мотивационная цитата внизу */}
            <div className={styles.quoteCardCompact}>
              <p className={styles.quoteTextCompact}>"{todayQuote.text}"</p>
              <p className={styles.quoteAuthorCompact}>— {todayQuote.author}</p>
            </div>
          </div>

          {/* Правая колонка - тренировки */}
          <div className={styles.rightColumn}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>📁 Последние тренировки</h2>
            </div>

            {recentWorkouts.length > 0 ? (
              <div className={styles.workoutsGrid}>
                {recentWorkouts.map((workout, index) => (
                  <div
                    key={workout.id}
                    className={`${styles.workoutFolder} ${getFolderColor(index)}`}
                    onClick={() => navigate(`/workouts/${workout.id}`)}
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
                        <span className={styles.folderStatIcon}>🏋️</span>
                        {workout.exercises_count || 0}
                      </span>
                      <span className={styles.folderStat}>
                        <span className={styles.folderStatIcon}>⚡</span>
                        {workout.total_sets || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyFolder}>
                <div className={styles.emptyIcon}>📁</div>
                <h3 className={styles.emptyTitle}>Нет тренировок</h3>
                <p className={styles.emptyText}>
                  Создайте свою первую тренировку, чтобы начать отслеживать прогресс
                </p>
                <button
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

export default HomePage;