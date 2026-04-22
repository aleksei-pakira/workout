import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import styles from './ExercisesPage.module.css';

function escapePbLike(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function ExercisesPage() {
  const user = pb.authStore.model;
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('my'); // 'my' | 'add' | 'create'
  const [myQ, setMyQ] = useState('');
  const [libraryQ, setLibraryQ] = useState('');
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryTotalPages, setLibraryTotalPages] = useState(1);
  const [showAdded, setShowAdded] = useState(true);
  const [showCreated, setShowCreated] = useState(false);

  const [myExercises, setMyExercises] = useState([]);
  const [libraryLinks, setLibraryLinks] = useState([]);
  const [publicItems, setPublicItems] = useState([]);
  const [myPublicIds, setMyPublicIds] = useState(() => new Set());

  // Левая колонка: профиль (как на других страницах)
  const [avatar, setAvatar] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Создание собственного упражнения
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newExercise, setNewExercise] = useState({
    exercise_name: '',
    muscle_group: '',
    video_url: '',
    exercise_description: '',
  });

  const loadExercises = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Мои созданные
      const my = await pb.collection('user_exercises').getFullList({
        filter: `created_by = "${user.id}"`,
        sort: 'exercise_name',
        requestKey: null,
      });

      // Мои добавленные из библиотеки
      const links = await pb.collection('user_exercise_library').getFullList({
        filter: `user = "${user.id}"`,
        expand: 'exercise',
        requestKey: null,
      });

      setMyExercises(my);
      setLibraryLinks(links);

      setMyPublicIds(new Set(links.map((r) => r.exercise).filter(Boolean)));
    } catch (e) {
      console.error('Ошибка загрузки упражнений:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial load
    loadExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const tabFromState = location?.state?.tab;
    if (tabFromState === 'my' || tabFromState === 'add' || tabFromState === 'create') {
      setActiveTab(tabFromState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevTabRef = useRef(activeTab);

  useEffect(() => {
    // restore scroll for initial tab
    const key = `scroll:/exercises:${activeTab}`;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const y = Number(saved);
      if (Number.isFinite(y)) window.scrollTo(0, y);
    }
    prevTabRef.current = activeTab;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prev = prevTabRef.current;
    if (prev && prev !== activeTab) {
      sessionStorage.setItem(`scroll:/exercises:${prev}`, String(window.scrollY || 0));
    }

    const saved = sessionStorage.getItem(`scroll:/exercises:${activeTab}`);
    if (saved) {
      const y = Number(saved);
      if (Number.isFinite(y)) window.scrollTo(0, y);
    } else {
      window.scrollTo(0, 0);
    }

    prevTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const syncAvatar = () => {
      const u = pb.authStore.model;
      if (u?.avatar) setAvatar(pb.files.getUrl(u, u.avatar));
      else setAvatar(null);
    };

    syncAvatar();
    const unsubscribe = pb.authStore.onChange(() => {
      syncAvatar();
    });

    return unsubscribe;
  }, []);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

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

  const myQueryEscaped = escapePbLike(myQ.trim()).toLowerCase();
  const libraryQueryTrimmed = libraryQ.trim();
  const libraryQueryEscaped = escapePbLike(libraryQueryTrimmed);

  const PER_PAGE = 60;

  const loadLibraryPage = async ({ pageNumber, query }) => {
    if (!user?.id) return;
    try {
      const publicFilter = query
        ? `is_public = true && exercise_name ~ "${escapePbLike(query)}"`
        : 'is_public = true';

      const res = await pb.collection('exercises').getList(pageNumber, PER_PAGE, {
        filter: publicFilter,
        sort: 'exercise_name',
        requestKey: null,
      });

      setPublicItems(res.items || []);
      setLibraryTotalPages(res.totalPages || 1);
    } catch (e) {
      console.error('Ошибка загрузки библиотеки упражнений:', e);
    }
  };

  useEffect(() => {
    if (activeTab !== 'add') return;
    setLibraryPage(1);
  }, [activeTab, libraryQ]);

  useEffect(() => {
    if (activeTab !== 'add') return;
    // ensure "Добавлено" state is correct before rendering library
    loadExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (!user?.id) return;
    if (activeTab !== 'add') return;

    const t = setTimeout(() => {
      loadLibraryPage({ pageNumber: libraryPage, query: libraryQ.trim() });
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, libraryPage, libraryQ, user?.id]);

  const createMyExercise = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    const name = newExercise.exercise_name.trim();
    if (!name) {
      setCreateError('Название упражнения обязательно');
      return;
    }

    setCreateError('');
    setCreating(true);
    try {
      await pb.collection('user_exercises').create(
        {
          created_by: user.id,
          exercise_name: name,
          muscle_group: newExercise.muscle_group.trim(),
          video_url: newExercise.video_url.trim(),
          exercise_description: newExercise.exercise_description.trim(),
        },
        { requestKey: null }
      );

      setNewExercise({
        exercise_name: '',
        muscle_group: '',
        video_url: '',
        exercise_description: '',
      });

      await loadExercises();
      setShowCreated(true);
      setActiveTab('my');
    } catch (err) {
      console.error('Ошибка создания упражнения:', err);
      setCreateError(err?.message || 'Не удалось создать упражнение');
    } finally {
      setCreating(false);
    }
  };

  const deleteMyExercise = async (id) => {
    if (!confirm('Удалить упражнение?')) return;
    try {
      await pb.collection('user_exercises').delete(id, { requestKey: null });
      await loadExercises();
    } catch (e) {
      console.error('Ошибка удаления упражнения:', e);
      alert('Не удалось удалить упражнение');
    }
  };

  const removeFromMyLibrary = async (linkId) => {
    if (!confirm('Убрать упражнение из моих?')) return;
    try {
      await pb.collection('user_exercise_library').delete(linkId, { requestKey: null });
      await loadExercises();
    } catch (e) {
      console.error('Ошибка удаления из моих упражнений:', e);
      alert('Не удалось убрать упражнение');
    }
  };

  const addToMyFromLibrary = async (exerciseId) => {
    if (!user?.id) return;
    if (myPublicIds.has(exerciseId)) return;
    try {
      await pb.collection('user_exercise_library').create(
        { user: user.id, exercise: exerciseId },
        { requestKey: null }
      );
      setMyPublicIds((prev) => new Set(prev).add(exerciseId));

      // чтобы "Мои" сразу обновились, если пользователь вернется
      loadExercises();
    } catch (e) {
      console.error('Ошибка добавления упражнения в мои:', e);
      alert('Не удалось добавить упражнение');
    }
  };

  const libraryExercises = useMemo(() => {
    return libraryLinks
      .map((r) => ({ linkId: r.id, exercise: r.expand?.exercise }))
      .filter((x) => x.exercise && x.exercise.id);
  }, [libraryLinks]);

  const filteredLibraryExercises = useMemo(() => {
    if (!myQueryEscaped) return libraryExercises;
    return libraryExercises.filter(({ exercise }) =>
      (exercise.exercise_name || '').toLowerCase().includes(myQueryEscaped)
    );
  }, [libraryExercises, myQueryEscaped]);

  const filteredMyExercises = useMemo(() => {
    if (!myQueryEscaped) return myExercises;
    return myExercises.filter((ex) =>
      (ex.exercise_name || '').toLowerCase().includes(myQueryEscaped)
    );
  }, [myExercises, myQueryEscaped]);

  if (loading) {
    return (
      <>
        <Header />
        <div className={styles.loading}>Загрузка упражнений...</div>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.content}>
        <div className={styles.grid}>
          {/* Левая колонка (скрывается на мобиле) */}
          <div className={styles.leftColumn}>
            <div className={styles.profileCard}>
              <div className={styles.profileHeader}>
                <div className={styles.avatar}>{user?.email?.[0].toUpperCase() || '👤'}</div>
                <div className={styles.userInfoCompact}>
                  <h2 className={styles.userNameCompact}>
                    Привет, {user?.email?.split('@')[0] || 'пользователь'}!
                  </h2>
                  <p className={styles.userEmailCompact}>{user?.email}</p>
                </div>
              </div>

              <div
                className={styles.photoUploadArea}
                onClick={() => document.getElementById('avatarInputExercises')?.click()}
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

                {avatar && (
                  <div className={styles.photoOverlay}>
                    <span className={styles.photoOverlayText}>Изменить фото</span>
                  </div>
                )}

                <input
                  id="avatarInputExercises"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* Правая колонка */}
          <div className={styles.rightColumn}>
            <div className={styles.tabsRow}>
              <button
                type="button"
                className={activeTab === 'my' ? styles.tabBtnActive : styles.tabBtn}
                onClick={() => setActiveTab('my')}
              >
                Мои упражнения
              </button>
              <button
                type="button"
                className={activeTab === 'add' ? styles.tabBtnActive : styles.tabBtn}
                onClick={() => setActiveTab('add')}
              >
                Добавить упражнение
              </button>
              <button
                type="button"
                className={activeTab === 'create' ? styles.tabBtnActive : styles.tabBtn}
                onClick={() => setActiveTab('create')}
              >
                Создать упражнение
              </button>
            </div>

            {/* ===== TAB: MY ===== */}
            {activeTab === 'my' && (
              <>
                <div className={styles.topRow}>
                  <div className={styles.searchWrap}>
                    <input
                      value={myQ}
                      onChange={(e) => setMyQ(e.target.value)}
                      className={styles.searchInput}
                      placeholder="Поиск в моих упражнениях…"
                    />
                  </div>

                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={showAdded}
                      onChange={(e) => setShowAdded(e.target.checked)}
                    />
                    <span className={styles.toggleTrack} aria-hidden="true">
                      <span className={styles.toggleThumb} />
                    </span>
                    <span>Добавленные</span>
                  </label>

                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={showCreated}
                      onChange={(e) => setShowCreated(e.target.checked)}
                    />
                    <span className={styles.toggleTrack} aria-hidden="true">
                      <span className={styles.toggleThumb} />
                    </span>
                    <span>Созданные</span>
                  </label>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Мои упражнения</h2>
                  </div>

                  {showAdded && (
                    <div className={styles.subSection}>
                      {filteredLibraryExercises.length === 0 ? (
                        <div className={styles.emptyState}>Пока нет добавленных упражнений.</div>
                      ) : (
                        <div className={styles.cardsGrid}>
                          {filteredLibraryExercises.map(({ linkId, exercise }) => (
                            <div key={exercise.id} className={styles.card}>
                              <div className={styles.cardTitle}>{exercise.exercise_name}</div>
                              {exercise.muscle_group && (
                                <div className={styles.cardMeta}>{exercise.muscle_group}</div>
                              )}
                              <div className={styles.cardActions}>
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  onClick={() => removeFromMyLibrary(linkId)}
                                >
                                  <span className={styles.labelFull}>Убрать из моих</span>
                                  <span className={styles.labelShort}>Убрать</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {showCreated && (
                    <div className={styles.subSection}>
                      {filteredMyExercises.length === 0 ? (
                        <div className={styles.emptyState}>Пока нет пользовательских упражнений.</div>
                      ) : (
                        <div className={styles.cardsGrid}>
                          {filteredMyExercises.map((ex) => (
                            <div key={ex.id} className={styles.card}>
                              <div className={styles.cardTitle}>{ex.exercise_name}</div>
                              {ex.muscle_group && (
                                <div className={styles.cardMeta}>{ex.muscle_group}</div>
                              )}
                              <div className={styles.cardActions}>
                                <button
                                  type="button"
                                  className={styles.dangerBtn}
                                  onClick={() => deleteMyExercise(ex.id)}
                                >
                                  Удалить
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ===== TAB: ADD (LIBRARY) ===== */}
            {activeTab === 'add' && (
              <>
                <div className={styles.topRow}>
                  <div className={styles.searchWrap}>
                    <input
                      value={libraryQ}
                      onChange={(e) => setLibraryQ(e.target.value)}
                      className={styles.searchInput}
                      placeholder="Поиск в библиотеке…"
                    />
                  </div>
                  <div className={styles.pager}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      disabled={libraryPage <= 1}
                      onClick={() => setLibraryPage((p) => Math.max(1, p - 1))}
                    >
                      Назад
                    </button>
                    <div className={styles.pagerMeta}>
                      Страница {libraryPage} из {libraryTotalPages}
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      disabled={libraryPage >= libraryTotalPages}
                      onClick={() => setLibraryPage((p) => Math.min(libraryTotalPages, p + 1))}
                    >
                      Далее
                    </button>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Библиотека упражнений</h2>
                  </div>

                  {publicItems.length === 0 ? (
                    <div className={styles.emptyState}>
                      {libraryQueryTrimmed ? 'Ничего не найдено.' : 'Библиотека пуста.'}
                    </div>
                  ) : (
                    <div className={styles.cardsGrid}>
                      {publicItems.map((ex) => {
                        const added = myPublicIds.has(ex.id);
                        return (
                          <div key={ex.id} className={styles.card}>
                            <div className={styles.cardTitle}>{ex.exercise_name}</div>
                            {ex.muscle_group && <div className={styles.cardMeta}>{ex.muscle_group}</div>}
                            <div className={styles.cardActions}>
                              <button
                                type="button"
                                className={added ? styles.secondaryBtnDisabled : styles.primaryBtn}
                                disabled={added}
                                onClick={() => addToMyFromLibrary(ex.id)}
                              >
                                {added ? (
                                  'Добавлено'
                                ) : (
                                  <>
                                    <span className={styles.labelFull}>Добавить в мои</span>
                                    <span className={styles.labelShort}>В мои</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ===== TAB: CREATE ===== */}
            {activeTab === 'create' && (
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Создать упражнение</h2>
                </div>

                <form onSubmit={createMyExercise} className={styles.createForm}>
                  {createError && <div className={styles.formError}>{createError}</div>}

                  <div className={styles.formGrid}>
                    <input
                      className={styles.formInput}
                      value={newExercise.exercise_name}
                      onChange={(e) =>
                        setNewExercise((p) => ({ ...p, exercise_name: e.target.value }))
                      }
                      placeholder="Название *"
                    />
                    <input
                      className={styles.formInput}
                      value={newExercise.muscle_group}
                      onChange={(e) =>
                        setNewExercise((p) => ({ ...p, muscle_group: e.target.value }))
                      }
                      placeholder="Группа мышц"
                    />
                    <input
                      className={styles.formInput}
                      value={newExercise.video_url}
                      onChange={(e) => setNewExercise((p) => ({ ...p, video_url: e.target.value }))}
                      placeholder="Видео URL"
                    />
                    <input
                      className={styles.formInput}
                      value={newExercise.exercise_description}
                      onChange={(e) =>
                        setNewExercise((p) => ({ ...p, exercise_description: e.target.value }))
                      }
                      placeholder="Описание"
                    />
                  </div>

                  <div className={styles.formActions}>
                    <button type="submit" className={styles.primaryBtn} disabled={creating}>
                      {creating ? 'Создание…' : 'Создать'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExercisesPage;

