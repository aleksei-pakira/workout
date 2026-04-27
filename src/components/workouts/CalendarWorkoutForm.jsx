import { useEffect, useMemo, useState } from 'react';
import pb from '../../lib/pocketbase';
import styles from './CalendarWorkoutForm.module.css';

function normalizeStatus(raw) {
  if (!raw) return 'planned';
  if (raw === 'plan') return 'planned';
  if (raw === 'done') return 'completed';
  if (raw === 'fail') return 'failed';
  if (raw === 'planned' || raw === 'completed' || raw === 'failed' || raw === 'skipped') return raw;
  return 'planned';
}

function getNextDayKey(dayKey) {
  const d = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function CalendarWorkoutForm({ dayKey, onClose, onSaved }) {
  const user = pb.authStore.model;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dayWorkouts, setDayWorkouts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftSets, setDraftSets] = useState(() => [
    { set_number: 1, weight: '', reps: '', status: 'planned' },
  ]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [exerciseDropdownOpen, setExerciseDropdownOpen] = useState(false);
  const [exercisesLoading, setExercisesLoading] = useState(false);
  const [exercisesError, setExercisesError] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [selectedExerciseName, setSelectedExerciseName] = useState('');

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

  const canSave = useMemo(() => Boolean(selectedExerciseId), [selectedExerciseId]);

  const updateDraftSet = (idx, field, value) => {
    setDraftSets((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!dayKey) return;
    if (!selectedExerciseId) return;

    const nextDayKey = getNextDayKey(dayKey);
    if (!nextDayKey) return;

    try {
      setSaving(true);
      setSaveError(null);

      // Guard: if workout already exists for this day, don't create duplicates
      const existing = await pb.collection('workouts').getFullList({
        filter: `user = "${user.id}" && date >= "${dayKey}" && date < "${nextDayKey}"`,
        sort: '-created',
        requestKey: null,
      });

      if (existing.length > 0) {
        setDayWorkouts(existing);
        return;
      }

      const workout = await pb.collection('workouts').create(
        {
          user: user.id,
          date: dayKey,
          title: draftTitle,
          notes: draftNotes,
        },
        { requestKey: null }
      );

      const we = await pb.collection('workout_exercises').create(
        {
          workout: workout.id,
          exercise: selectedExerciseId,
          order_index: 1,
        },
        { requestKey: null }
      );

      await Promise.all(
        (draftSets.length ? draftSets : [{ weight: '', reps: '', status: 'planned' }]).map((s, i) =>
          pb.collection('sets').create(
            {
              workout_exercise: we.id,
              set_number: i + 1,
              weight: Number(s.weight) || 0,
              reps: Number(s.reps) || 0,
              status: s.status || 'planned',
            },
            { requestKey: null }
          )
        )
      );

      const list = await pb.collection('workouts').getFullList({
        filter: `user = "${user.id}" && date >= "${dayKey}" && date < "${nextDayKey}"`,
        sort: '-created',
        requestKey: null,
      });

      setDayWorkouts(list);
      setExerciseDropdownOpen(false);
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Ошибка сохранения тренировки:', e);
      console.error('PocketBase error details:', e?.data || e?.response || e);
      setSaveError('Не удалось сохранить тренировку');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!dayKey) return;
      if (!user?.id) return;
      const nextDayKey = getNextDayKey(dayKey);
      if (!nextDayKey) return;

      try {
        setLoading(true);
        setError(null);

        const list = await pb.collection('workouts').getFullList({
          filter: `user = "${user.id}" && date >= "${dayKey}" && date < "${nextDayKey}"`,
          sort: '-created',
          requestKey: null,
        });

        if (!mounted) return;
        setDayWorkouts(list);
      } catch (e) {
        console.error('Ошибка загрузки тренировок дня:', e);
        if (!mounted) return;
        setError('Не удалось загрузить тренировки за этот день');
        setDayWorkouts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [dayKey, user?.id]);

  const activeWorkout = useMemo(() => dayWorkouts[0] || null, [dayWorkouts]);
  const isCreateMode = useMemo(
    () => !loading && dayWorkouts.length === 0,
    [loading, dayWorkouts.length]
  );

  const [loadingWorkoutData, setLoadingWorkoutData] = useState(false);
  const [workoutDataError, setWorkoutDataError] = useState(null);
  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [setsByWeId, setSetsByWeId] = useState({});

  const createWorkout = async () => {
    if (!user?.id || !dayKey) return;
    const nextDayKey = getNextDayKey(dayKey);
    if (!nextDayKey) return;

    try {
      setCreating(true);
      setError(null);

      await pb.collection('workouts').create(
        {
          user: user.id,
          date: dayKey,
          title: `Тренировка ${dayKey}`,
        },
        { requestKey: null }
      );

      const list = await pb.collection('workouts').getFullList({
        filter: `user = "${user.id}" && date >= "${dayKey}" && date < "${nextDayKey}"`,
        sort: '-created',
        requestKey: null,
      });

      setDayWorkouts(list);
      onSaved?.();
    } catch (e) {
      console.error('Ошибка создания тренировки:', e);
      setError('Не удалось создать тренировку');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadWorkoutData = async () => {
      if (!activeWorkout?.id) {
        setWorkoutExercises([]);
        setSetsByWeId({});
        setWorkoutDataError(null);
        return;
      }

      try {
        setLoadingWorkoutData(true);
        setWorkoutDataError(null);

        const weList = await pb.collection('workout_exercises').getFullList({
          filter: `workout = "${activeWorkout.id}"`,
          expand: 'exercise',
          sort: 'order_index',
          requestKey: null,
        });

        if (!mounted) return;
        setWorkoutExercises(weList);

        const weIds = weList.map((x) => x.id);
        if (weIds.length === 0) {
          setSetsByWeId({});
          return;
        }

        const filter = weIds.map((id) => `workout_exercise = "${id}"`).join(' || ');
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
        console.error('Ошибка загрузки упражнений/подходов:', e);
        if (!mounted) return;
        setWorkoutDataError('Не удалось загрузить упражнения и подходы');
        setWorkoutExercises([]);
        setSetsByWeId({});
      } finally {
        if (mounted) setLoadingWorkoutData(false);
      }
    };

    loadWorkoutData();
    return () => {
      mounted = false;
    };
  }, [activeWorkout?.id]);

  const updateSetStatus = async (weId, setId, nextStatus) => {
    const normalizedNext = normalizeStatus(nextStatus);
    const prevSet = (setsByWeId[weId] || []).find((s) => s.id === setId);
    const prevStatus = normalizeStatus(prevSet?.status);

    setSetsByWeId((prev) => ({
      ...prev,
      [weId]: (prev[weId] || []).map((s) =>
        s.id === setId ? { ...s, status: normalizedNext } : s
      ),
    }));

    try {
      await pb.collection('sets').update(setId, { status: normalizedNext }, { requestKey: null });
    } catch (e) {
      console.error('Ошибка обновления статуса подхода:', e);
      console.error('PocketBase error details:', e?.data || e?.response || e);
      setWorkoutDataError('Не удалось сохранить статус');
      setSetsByWeId((prev) => ({
        ...prev,
        [weId]: (prev[weId] || []).map((s) =>
          s.id === setId ? { ...s, status: prevStatus } : s
        ),
      }));
    }
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div className={styles.date}>{dayKey}</div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.muted}>Загрузка…</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : isCreateMode ? (
            <div className={styles.workoutSummary}>
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

              <div className={styles.exerciseBlock}>
                <div className={styles.exerciseRow}>
                  <div className={styles.exerciseIndex}>1</div>
                  <button
                    type="button"
                    className={styles.exerciseNameBtn}
                    onClick={async () => {
                      const next = !exerciseDropdownOpen;
                      setExerciseDropdownOpen(next);
                      if (next) await loadExercises();
                    }}
                    title={selectedExerciseName}
                  >
                    {selectedExerciseName || 'Exercise'}
                  </button>
                </div>

                {exerciseDropdownOpen && (
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
                              setSelectedExerciseId(ex.id);
                              setSelectedExerciseName(ex.exercise_name || '');
                              setExerciseDropdownOpen(false);
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

                  {draftSets.map((s, idx) => (
                    <div key={s.set_number} className={styles.setRow}>
                      <div className={styles.cell}>
                        <input
                          type="number"
                          className={styles.cellInput}
                          value={s.weight}
                          onChange={(e) => updateDraftSet(idx, 'weight', e.target.value)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </div>
                      <div className={styles.cell}>
                        <input
                          type="number"
                          className={styles.cellInput}
                          value={s.reps}
                          onChange={(e) => updateDraftSet(idx, 'reps', e.target.value)}
                          placeholder="0"
                          inputMode="numeric"
                        />
                      </div>
                      <div className={styles.cell}>{s.status}</div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className={styles.addSetBtn}
                    onClick={() =>
                      setDraftSets((prev) => [
                        ...prev,
                        {
                          set_number: prev.length + 1,
                          weight: '',
                          reps: '',
                          status: 'planned',
                        },
                      ])
                    }
                  >
                    + Добавить подход
                  </button>
                </div>
              </div>

              <div className={styles.createFooter}>
                <button
                  type="button"
                  className={styles.saveBtn}
                  disabled={!canSave || saving}
                  onClick={handleSave}
                >
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
                {saveError ? <div className={styles.error}>{saveError}</div> : null}
              </div>
            </div>
          ) : (
            <div className={styles.workoutSummary}>
              <div className={styles.workoutTitle}>{activeWorkout?.title || 'Тренировка'}</div>
              {activeWorkout?.notes ? (
                <div className={styles.workoutNotes}>{activeWorkout.notes}</div>
              ) : null}

              {loadingWorkoutData ? (
                <div className={styles.muted}>Загрузка упражнений…</div>
              ) : workoutDataError ? (
                <div className={styles.error}>{workoutDataError}</div>
              ) : workoutExercises.length === 0 ? (
                <div className={styles.muted}>В этой тренировке пока нет упражнений</div>
              ) : (
                <div className={styles.exercises}>
                  {workoutExercises.map((we, idx) => {
                    const exerciseName =
                      we.expand?.exercise?.exercise_name || we.custom_name || we.exercise_name || '';
                    const sets = setsByWeId[we.id] || [];

                    return (
                      <div key={we.id} className={styles.exerciseBlock}>
                        <div className={styles.exerciseRow}>
                          <div className={styles.exerciseIndex}>{idx + 1}</div>
                          <div className={styles.exerciseName} title={exerciseName}>
                            {exerciseName || '(без названия)'}
                          </div>
                        </div>

                        <div className={styles.setsTable}>
                          <div className={styles.setsHeader}>
                            <div className={styles.hCell}>weight</div>
                            <div className={styles.hCell}>reps</div>
                            <div className={styles.hCell}>status</div>
                          </div>

                          {sets.length === 0 ? (
                            <div className={styles.noSets}>Пока нет подходов</div>
                          ) : (
                            sets.map((s) => {
                              const statusValue = normalizeStatus(s.status);

                              return (
                                <div key={s.id} className={styles.setRow}>
                                  <div className={styles.cell}>{s.weight}</div>
                                  <div className={styles.cell}>{s.reps}</div>
                                  <div className={styles.cell}>
                                    <select
                                      className={styles.statusSelect}
                                      value={statusValue}
                                      onChange={(e) => updateSetStatus(we.id, s.id, e.target.value)}
                                    >
                                      <option value="planned">plan</option>
                                      <option value="completed">done</option>
                                      <option value="failed">fail</option>
                                      <option value="skipped">skip</option>
                                    </select>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CalendarWorkoutForm;

