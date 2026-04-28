import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import styles from './WorkoutCalendarEditPage.module.css';

function normalizeStatus(raw) {
  if (!raw) return 'planned';
  if (raw === 'plan') return 'planned';
  if (raw === 'done') return 'completed';
  if (raw === 'fail') return 'failed';
  if (raw === 'planned' || raw === 'completed' || raw === 'failed' || raw === 'skipped') return raw;
  return 'planned';
}

function WorkoutCalendarEditPage() {
  const { id } = useParams();
  const user = pb.authStore.model;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [setsByWeId, setSetsByWeId] = useState({});

  const [didInitDraft, setDidInitDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftExercises, setDraftExercises] = useState([]);
  const [openExerciseDropdownIdx, setOpenExerciseDropdownIdx] = useState(null);
  const [exercisesLoading, setExercisesLoading] = useState(false);
  const [exercisesError, setExercisesError] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const loadExercises = async () => {
    if (exercisesLoading) return;
    if (exercises.length > 0) return;

    try {
      setExercisesLoading(true);
      setExercisesError(null);
      const list = await pb.collection('exercises').getFullList({
        sort: 'exercise_name',
        requestKey: null,
      });
      setExercises(list);
    } catch (e) {
      console.error('Ошибка загрузки упражнений:', e);
      setExercisesError('Не удалось загрузить упражнения');
    } finally {
      setExercisesLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);

        const w = await pb.collection('workouts').getOne(id, { requestKey: null });
        if (!mounted) return;

        // Optional access check (rules should already protect, but this makes UI clearer)
        if (user?.id && w?.user && w.user !== user.id) {
          setError('Нет доступа к этой тренировке');
          setWorkout(null);
          setWorkoutExercises([]);
          setSetsByWeId({});
          return;
        }

        setWorkout(w);

        const weList = await pb.collection('workout_exercises').getFullList({
          filter: `workout = "${id}"`,
          sort: 'order_index',
          expand: 'exercise',
          requestKey: null,
        });
        if (!mounted) return;
        setWorkoutExercises(weList);

        const weIds = weList.map((x) => x.id);
        if (weIds.length === 0) {
          setSetsByWeId({});
          return;
        }

        const filter = weIds.map((weId) => `workout_exercise = "${weId}"`).join(' || ');
        const sets = await pb.collection('sets').getFullList({
          filter,
          sort: 'set_number',
          requestKey: null,
        });
        if (!mounted) return;

        const grouped = {};
        for (const s of sets) {
          const key = s.workout_exercise;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(s);
        }
        setSetsByWeId(grouped);
      } catch (e) {
        console.error('Ошибка загрузки тренировки для редактирования:', e);
        if (!mounted) return;
        setError('Не удалось загрузить тренировку');
        setWorkout(null);
        setWorkoutExercises([]);
        setSetsByWeId({});
        setDidInitDraft(false);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [id, user?.id]);

  useEffect(() => {
    if (loading) return;
    if (error) return;
    if (!workout) return;
    if (didInitDraft) return;

    setDraftTitle(workout.title || '');
    setDraftNotes(workout.notes || '');

    const nextDraftExercises = (workoutExercises || []).map((we) => {
      const exerciseName =
        we.expand?.exercise?.exercise_name || we.custom_name || we.exercise_name || '';
      const sets = setsByWeId[we.id] || [];
      const nextSets =
        sets.length > 0
          ? sets.map((s) => ({
              set_number: s.set_number,
              weight: String(s.weight ?? ''),
              reps: String(s.reps ?? ''),
              status: normalizeStatus(s.status),
            }))
          : [{ set_number: 1, weight: '', reps: '', status: 'planned' }];

      return {
        exerciseId: we.exercise || '',
        exerciseName,
        sets: nextSets,
      };
    });

    setDraftExercises(nextDraftExercises);
    setDidInitDraft(true);
  }, [didInitDraft, error, loading, setsByWeId, workout, workoutExercises]);

  const updateDraftExercise = (idx, patch) => {
    setDraftExercises((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };

  const updateDraftSet = (exerciseIdx, setIdx, field, value) => {
    setDraftExercises((prev) => {
      const ex = prev[exerciseIdx];
      if (!ex) return prev;
      const nextSets = (ex.sets || []).map((s, i) => (i === setIdx ? { ...s, [field]: value } : s));
      return prev.map((x, i) => (i === exerciseIdx ? { ...x, sets: nextSets } : x));
    });
  };

  const addDraftSet = (exerciseIdx) => {
    setDraftExercises((prev) => {
      const ex = prev[exerciseIdx];
      if (!ex) return prev;
      const sets = ex.sets || [];
      const nextSets = [...sets, { set_number: sets.length + 1, weight: '', reps: '', status: 'planned' }];
      return prev.map((x, i) => (i === exerciseIdx ? { ...x, sets: nextSets } : x));
    });
  };

  const removeDraftSet = (exerciseIdx, setIdx) => {
    setDraftExercises((prev) => {
      const ex = prev[exerciseIdx];
      if (!ex) return prev;
      const sets = ex.sets || [];
      if (sets.length <= 1) return prev;
      const nextSets = sets
        .filter((_, i) => i !== setIdx)
        .map((s, i) => ({ ...s, set_number: i + 1 }));
      return prev.map((x, i) => (i === exerciseIdx ? { ...x, sets: nextSets } : x));
    });
  };

  const addDraftExercise = () => {
    setDraftExercises((prev) => [
      ...prev,
      {
        exerciseId: '',
        exerciseName: '',
        sets: [{ set_number: 1, weight: '', reps: '', status: 'planned' }],
      },
    ]);
    setOpenExerciseDropdownIdx(null);
  };

  const removeDraftExercise = (exerciseIdx) => {
    setDraftExercises((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== exerciseIdx);
    });

    setOpenExerciseDropdownIdx((prev) => {
      if (prev === null) return null;
      if (prev === exerciseIdx) return null;
      if (prev > exerciseIdx) return prev - 1;
      return prev;
    });
  };

  const toggleExerciseDropdown = async (exerciseIdx) => {
    const nextIdx = openExerciseDropdownIdx === exerciseIdx ? null : exerciseIdx;
    setOpenExerciseDropdownIdx(nextIdx);
    if (nextIdx !== null) await loadExercises();
  };

  const canSave = useMemo(
    () => draftExercises.length > 0 && draftExercises.every((x) => Boolean(x.exerciseId)),
    [draftExercises]
  );

  const handleSave = async () => {
    if (!id) return;
    if (!user?.id) return;
    if (!canSave) return;

    try {
      setSaving(true);
      setSaveError(null);
      setDeleteError(null);

      await pb.collection('workouts').update(
        id,
        {
          title: draftTitle,
          notes: draftNotes,
        },
        { requestKey: null }
      );

      const currentWe = await pb.collection('workout_exercises').getFullList({
        filter: `workout = "${id}"`,
        sort: 'order_index',
        requestKey: null,
      });

      const weIds = currentWe.map((x) => x.id);
      if (weIds.length > 0) {
        const setsFilter = weIds.map((weId) => `workout_exercise = "${weId}"`).join(' || ');
        const currentSets = await pb.collection('sets').getFullList({
          filter: setsFilter,
          requestKey: null,
        });

        await Promise.all(
          currentSets.map((s) => pb.collection('sets').delete(s.id, { requestKey: null }))
        );

        await Promise.all(
          currentWe.map((we) => pb.collection('workout_exercises').delete(we.id, { requestKey: null }))
        );
      }

      await Promise.all(
        draftExercises.map(async (ex, exIdx) => {
          const we = await pb.collection('workout_exercises').create(
            {
              workout: id,
              exercise: ex.exerciseId,
              order_index: exIdx + 1,
            },
            { requestKey: null }
          );

          const setsToCreate =
            ex.sets && ex.sets.length ? ex.sets : [{ weight: '', reps: '', status: 'planned' }];

          await Promise.all(
            setsToCreate.map((s, i) =>
              pb.collection('sets').create(
                {
                  workout_exercise: we.id,
                  set_number: i + 1,
                  weight: Number(s.weight) || 0,
                  reps: Number(s.reps) || 0,
                  status: normalizeStatus(s.status),
                },
                { requestKey: null }
              )
            )
          );
        })
      );

      setOpenExerciseDropdownIdx(null);
      navigate(`/workouts/calendar?r=${Date.now()}`);
    } catch (e) {
      console.error('Ошибка сохранения тренировки (edit):', e);
      console.error('PocketBase error details:', e?.data || e?.response || e);
      setSaveError('Не удалось сохранить тренировку');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkout = async () => {
    if (!id) return;
    if (!user?.id) return;

    const ok = window.confirm('Удалить тренировку? Это действие нельзя отменить.');
    if (!ok) return;

    try {
      setDeleting(true);
      setDeleteError(null);
      setSaveError(null);

      const currentWe = await pb.collection('workout_exercises').getFullList({
        filter: `workout = "${id}"`,
        sort: 'order_index',
        requestKey: null,
      });

      const weIds = currentWe.map((x) => x.id);
      if (weIds.length > 0) {
        const setsFilter = weIds.map((weId) => `workout_exercise = "${weId}"`).join(' || ');
        const currentSets = await pb.collection('sets').getFullList({
          filter: setsFilter,
          requestKey: null,
        });

        await Promise.all(
          currentSets.map((s) => pb.collection('sets').delete(s.id, { requestKey: null }))
        );

        await Promise.all(
          currentWe.map((we) => pb.collection('workout_exercises').delete(we.id, { requestKey: null }))
        );
      }

      await pb.collection('workouts').delete(id, { requestKey: null });

      setOpenExerciseDropdownIdx(null);
      navigate(`/workouts/calendar?r=${Date.now()}`);
    } catch (e) {
      console.error('Ошибка удаления тренировки (edit):', e);
      console.error('PocketBase error details:', e?.data || e?.response || e);
      setDeleteError('Не удалось удалить тренировку');
    } finally {
      setDeleting(false);
    }
  };

  const title = useMemo(() => workout?.title || 'Тренировка', [workout?.title]);

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.title}>Редактирование: {title}</div>
        </div>
        <div className={styles.body}>
          {loading ? (
            <div className={styles.muted}>Загрузка…</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : !workout ? (
            <div className={styles.muted}>Тренировка не найдена</div>
          ) : (
            <div className={styles.workoutSummary}>
              <div className={styles.kv}>
                <div className={styles.k}>Дата</div>
                <div className={styles.v}>{workout.date}</div>
              </div>

              <input
                className={styles.workoutTitleInput}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Workout name"
              />

              <input
                className={styles.workoutNotesInput}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="Workout notes (optional)"
              />

              {draftExercises.length === 0 ? (
                <div className={styles.muted}>Нет упражнений</div>
              ) : (
                draftExercises.map((exBlock, exIdx) => (
                  <div key={exIdx} className={styles.exerciseBlock}>
                    <div className={styles.exerciseRow}>
                      <div className={styles.exerciseIndex}>{exIdx + 1}</div>
                      <button
                        type="button"
                        className={styles.exerciseNameBtn}
                        onClick={() => toggleExerciseDropdown(exIdx)}
                        title={exBlock.exerciseName}
                      >
                        {exBlock.exerciseName || 'Exercise'}
                      </button>

                      <button
                        type="button"
                        className={styles.removeExerciseBtn}
                        onClick={() => removeDraftExercise(exIdx)}
                        disabled={exIdx === 0 || draftExercises.length <= 1}
                        aria-label="Remove exercise"
                      >
                        ×
                      </button>
                    </div>

                    {openExerciseDropdownIdx === exIdx && (
                      <div className={styles.exerciseDropdown}>
                        {exercisesLoading ? (
                          <div className={styles.dropdownMsg}>Загрузка…</div>
                        ) : exercisesError ? (
                          <div className={styles.dropdownError}>{exercisesError}</div>
                        ) : exercises.length === 0 ? (
                          <div className={styles.dropdownMsg}>Нет упражнений</div>
                        ) : (
                          <div className={styles.dropdownList}>
                            {exercises.map((ex) => (
                              <button
                                key={ex.id}
                                type="button"
                                className={styles.dropdownItem}
                                onClick={() => {
                                  updateDraftExercise(exIdx, {
                                    exerciseId: ex.id,
                                    exerciseName: ex.exercise_name || '',
                                  });
                                  setOpenExerciseDropdownIdx(null);
                                }}
                              >
                                {ex.exercise_name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className={styles.setsTable}>
                      <div className={styles.setsHeader}>
                        <div className={styles.hCell}>weight</div>
                        <div className={styles.hCell}>reps</div>
                        <div className={styles.hCell}>status</div>
                      </div>

                      {(exBlock.sets || []).map((s, setIdx) => (
                        <div key={s.set_number} className={styles.setRowCreate}>
                          <div className={styles.cell}>
                            <input
                              type="number"
                              className={styles.cellInput}
                              value={s.weight}
                              onChange={(e) => updateDraftSet(exIdx, setIdx, 'weight', e.target.value)}
                              placeholder="0"
                              inputMode="decimal"
                            />
                          </div>
                          <div className={styles.cell}>
                            <input
                              type="number"
                              className={styles.cellInput}
                              value={s.reps}
                              onChange={(e) => updateDraftSet(exIdx, setIdx, 'reps', e.target.value)}
                              placeholder="0"
                              inputMode="numeric"
                            />
                          </div>
                          <div className={styles.cell}>
                            <select
                              className={styles.statusSelect}
                              value={normalizeStatus(s.status)}
                              onChange={(e) => updateDraftSet(exIdx, setIdx, 'status', e.target.value)}
                            >
                              <option value="planned">planned</option>
                              <option value="completed">completed</option>
                              <option value="failed">failed</option>
                              <option value="skipped">skipped</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            className={styles.removeSetBtn}
                            onClick={() => removeDraftSet(exIdx, setIdx)}
                            aria-label="Remove set"
                            disabled={(exBlock.sets || []).length <= 1}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        className={styles.addSetBtn}
                        onClick={() => addDraftSet(exIdx)}
                      >
                        + Добавить подход
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className={styles.footer}>
                <button type="button" className={styles.addExerciseBtn} onClick={addDraftExercise}>
                  + Добавить упражнение
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  disabled={!canSave || saving}
                  onClick={handleSave}
                >
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>

              {saveError ? <div className={styles.error}>{saveError}</div> : null}
              {deleteError ? <div className={styles.error}>{deleteError}</div> : null}

              <button
                type="button"
                className={styles.deleteBtn}
                onClick={handleDeleteWorkout}
                disabled={deleting || saving}
              >
                {deleting ? 'Удаляем…' : 'Удалить тренировку'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorkoutCalendarEditPage;

