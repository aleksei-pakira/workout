import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import styles from './ExercisesLibraryPage.module.css';

function escapePbLike(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const PER_PAGE = 60;

function ExercisesLibraryPage() {
  const user = pb.authStore.model;
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const [publicItems, setPublicItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [myPublicIds, setMyPublicIds] = useState(() => new Set());

  const loadMyLinks = async () => {
    if (!user?.id) return;
    const links = await pb.collection('user_exercise_library').getFullList({
      filter: `user = "${user.id}"`,
      fields: 'id,exercise',
      requestKey: null,
    });
    setMyPublicIds(new Set(links.map((r) => r.exercise).filter(Boolean)));
  };

  const loadPublic = async ({ query, pageNumber }) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const queryTrimmed = query.trim();
      const queryEscaped = escapePbLike(queryTrimmed);
      const publicFilter = queryTrimmed
        ? `is_public = true && exercise_name ~ "${queryEscaped}"`
        : 'is_public = true';

      const res = await pb.collection('exercises').getList(pageNumber, PER_PAGE, {
        filter: publicFilter,
        sort: 'exercise_name',
        requestKey: null,
      });

      setPublicItems(res.items || []);
      setTotalPages(res.totalPages || 1);
    } catch (e) {
      console.error('Ошибка загрузки библиотеки упражнений:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const qFromState = location?.state?.q;
    if (typeof qFromState === 'string') {
      setQ(qFromState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const key = 'scroll:/exercises/library';
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const y = Number(saved);
      if (Number.isFinite(y)) window.scrollTo(0, y);
    }
    return () => {
      sessionStorage.setItem(key, String(window.scrollY || 0));
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadMyLinks().catch((e) => console.error(e));
    loadPublic({ query: '', pageNumber: 1 }).catch((e) => console.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => {
      loadPublic({ query: q, pageNumber: page }).catch((e) => console.error(e));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, user?.id]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const addToMy = async (exerciseId) => {
    if (!user?.id) return;
    if (myPublicIds.has(exerciseId)) return;
    try {
      await pb.collection('user_exercise_library').create(
        { user: user.id, exercise: exerciseId },
        { requestKey: null }
      );
      setMyPublicIds((prev) => new Set(prev).add(exerciseId));
      return true;
    } catch (e) {
      console.error('Ошибка добавления упражнения в мои:', e);
      alert('Не удалось добавить упражнение');
      return false;
    }
  };

  const summary = useMemo(() => {
    if (loading) return 'Загрузка…';
    if (publicItems.length === 0) return 'Ничего не найдено.';
    return `Страница ${page} из ${totalPages}`;
  }, [loading, publicItems.length, page, totalPages]);

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.content}>
        <div className={styles.topRow}>
          <button type="button" className={styles.secondaryBtn} onClick={() => navigate(-1)}>
            Назад
          </button>

          <div className={styles.searchWrap}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={styles.searchInput}
              placeholder="Поиск в библиотеке…"
            />
          </div>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() =>
              navigate('/exercises', {
                state: { from: 'library', q },
              })
            }
          >
            Мои упражнения
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Библиотека упражнений</h2>
            <div className={styles.pager}>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={!canPrev || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </button>
              <div className={styles.pagerMeta}>{summary}</div>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={!canNext || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Далее
              </button>
            </div>
          </div>

          {loading ? (
            <div className={styles.loadingInline}>Загрузка…</div>
          ) : publicItems.length === 0 ? (
            <div className={styles.emptyState}>Ничего не найдено.</div>
          ) : (
            <div className={styles.grid}>
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
                        onClick={() => addToMy(ex.id)}
                      >
                        {added ? 'Добавлено' : 'Добавить в мои'}
                      </button>

                      {!added && (
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={async () => {
                            const ok = await addToMy(ex.id);
                            if (ok) navigate(-1);
                          }}
                        >
                          Добавить и вернуться
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExercisesLibraryPage;

