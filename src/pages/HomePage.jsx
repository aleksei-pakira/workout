// src/pages/HomePage.jsx
import { useState, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import { getCoachingModeLabel, isTrainer } from '../lib/permissions';
import { useCoachSession } from '../hooks/useCoachSession';
import styles from './HomePage.module.css';

function HomePage() {
  const { authUser, trainerLinks, clientCanEditPlans, isCoached } = useCoachSession();
  const user = authUser;
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    weeklyWorkouts: 0,
    bestWeight: 0,
    favoriteExercise: '—'
  });
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const syncAvatar = () => {
      const u = pb.authStore.model;
      if (u?.avatar) setAvatar(pb.files.getURL(u, u.avatar));
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

  const loadDashboardData = useCallback(async () => {
    if (!user?.id) return;
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

      const workoutIds = workouts.slice(0, 5).map((w) => w.id);
      if (workoutIds.length > 0) {
        const workoutFilter = workoutIds.map((wid) => `workout = "${wid}"`).join(' || ');
        const exerciseBlocks = await pb.collection('workout_exercises').getFullList({
          filter: workoutFilter,
          expand: 'exercise',
          requestKey: null,
        });

        const weIds = exerciseBlocks.map((ex) => ex.id);
        let variantsByWeId = {};
        let setsByVariantId = {};

        if (weIds.length > 0) {
          const weFilter = weIds.map((weId) => `workout_exercise = "${weId}"`).join(' || ');
          const variants = await pb.collection('workout_exercise_variants').getFullList({
            filter: weFilter,
            expand: 'exercise',
            requestKey: null,
          });

          for (const v of variants) {
            const weId = v.workout_exercise;
            if (!variantsByWeId[weId]) variantsByWeId[weId] = [];
            variantsByWeId[weId].push(v);
          }

          const variantIds = variants.map((v) => v.id);
          if (variantIds.length > 0) {
            const variantFilter = variantIds
              .map((vid) => `workout_exercise_variant = "${vid}"`)
              .join(' || ');
            const sets = await pb.collection('sets').getFullList({
              filter: variantFilter,
              requestKey: null,
            });

            for (const set of sets) {
              const key = set.workout_exercise_variant;
              if (!setsByVariantId[key]) setsByVariantId[key] = [];
              setsByVariantId[key].push(set);
            }
          }
        }

        for (const ex of exerciseBlocks) {
          const variants = variantsByWeId[ex.id] || [];
          const activeIndex = ex.active_variant_index ?? 0;
          const activeVariant =
            variants.find((v) => v.variant_index === activeIndex) ||
            variants.find((v) => v.variant_index === 0) ||
            variants[0];

          const exName =
            activeVariant?.expand?.exercise?.exercise_name ||
            ex.expand?.exercise?.exercise_name ||
            ex.custom_name;
          if (exName) {
            exerciseCount[exName] = (exerciseCount[exName] || 0) + 1;
          }

          const variantSets = activeVariant ? setsByVariantId[activeVariant.id] || [] : [];
          for (const set of variantSets) {
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

    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

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
      setAvatar(pb.files.getURL(updated, updated.avatar));
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

              {isTrainer(user) && user?.invite_code ? (
                <div className={styles.coachBlock}>
                  <div className={styles.coachBlockTitle}>Код тренера</div>
                  <code className={styles.coachCode}>{user.invite_code}</code>
                  <a className={styles.coachLink} href={`/join/${encodeURIComponent(user.invite_code)}`}>
                    Ссылка для клиентов
                  </a>
                </div>
              ) : null}

              {!isTrainer(user) && isCoached ? (
                <div className={styles.coachBlock}>
                  <div className={styles.coachBlockTitle}>Режим</div>
                  <p className={styles.coachModeText}>
                    {getCoachingModeLabel({
                      trainerLinkCount: trainerLinks.length,
                      clientCanEditPlans,
                    })}
                  </p>
                </div>
              ) : null}

              {!isTrainer(user) && trainerLinks.length === 0 ? (
                <div className={styles.coachBlock}>
                  <a className={styles.coachLink} href="/join">
                    Подключить тренера
                  </a>
                </div>
              ) : null}

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
            </div>

            {/* Мотивационная цитата внизу */}
            <div className={styles.quoteCardCompact}>
              <p className={styles.quoteTextCompact}>"{todayQuote.text}"</p>
              <p className={styles.quoteAuthorCompact}>— {todayQuote.author}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;