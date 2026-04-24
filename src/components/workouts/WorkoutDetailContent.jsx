import { useEffect, useMemo, useState } from 'react';
import pb from '../../lib/pocketbase';
import styles from '../../pages/WorkoutDetailPage.module.css';

function WorkoutDetailContent({ workoutId, variant = 'page', showMeta = true }) {
  const isInline = variant === 'inline';
  const user = pb.authStore.model;
  const [workout, setWorkout] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [sets, setSets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myExerciseOptions, setMyExerciseOptions] = useState([]);
  const [addOpenFor, setAddOpenFor] = useState(null);
  const [addSelected, setAddSelected] = useState('');
  const [addingExercise, setAddingExercise] = useState(false);
  const [loadingMyExercises, setLoadingMyExercises] = useState(false);

  useEffect(() => {
    if (!workoutId) return;
    let isMounted = true;

    const loadAllData = async () => {
      try {
        setLoading(true);
        setError('');

        const workoutData = await pb.collection('workouts').getOne(workoutId, {
          requestKey: null,
        });

        const exercisesData = await pb.collection('workout_exercises').getFullList({
          filter: `workout = "${workoutId}"`,
          expand: 'exercise',
          sort: 'order_index',
          requestKey: null,
        });

        const setsMap = {};
        for (const ex of exercisesData) {
          const setsData = await pb.collection('sets').getFullList({
            filter: `workout_exercise = "${ex.id}"`,
            sort: 'set_number',
            requestKey: null,
          });
          setsMap[ex.id] = setsData;
        }

        if (isMounted) {
          setWorkout(workoutData);
          setExercises(exercisesData);
          setSets(setsMap);
        }
      } catch (e) {
        if (isMounted) {
          console.error('Ошибка загрузки:', e);
          setError('Не удалось загрузить данные тренировки: ' + e.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAllData();

    return () => {
      isMounted = false;
    };
  }, [workoutId]);

  useEffect(() => {
    if (!isInline) return;
    if (!user?.id) return;
    let isMounted = true;

    const loadMyExercises = async () => {
      try {
        setLoadingMyExercises(true);

        const [created, links] = await Promise.all([
          pb.collection('user_exercises').getFullList({
            filter: `created_by = "${user.id}"`,
            sort: 'exercise_name',
            requestKey: null,
          }),
          pb.collection('user_exercise_library').getFullList({
            filter: `user = "${user.id}"`,
            expand: 'exercise',
            requestKey: null,
          }),
        ]);

        const options = [];

        for (const item of links) {
          const ex = item.expand?.exercise;
          if (!ex) continue;
          options.push({
            key: `public:${ex.id}`,
            label: ex.exercise_name,
            exerciseId: ex.id,
            type: 'public',
          });
        }

        for (const ex of created) {
          options.push({
            key: `custom:${ex.id}`,
            label: ex.exercise_name,
            customName: ex.exercise_name,
            type: 'custom',
          });
        }

        options.sort((a, b) => a.label.localeCompare(b.label, 'ru-RU'));

        if (isMounted) setMyExerciseOptions(options);
      } catch (e) {
        console.error('Ошибка загрузки упражнений:', e);
      } finally {
        if (isMounted) setLoadingMyExercises(false);
      }
    };

    loadMyExercises();

    return () => {
      isMounted = false;
    };
  }, [isInline, user?.id]);

  const addSet = async (workoutExerciseId) => {
    try {
      const existingSets = sets[workoutExerciseId] || [];
      const nextNumber = existingSets.length + 1;

      const newSet = await pb.collection('sets').create(
        {
          workout_exercise: workoutExerciseId,
          set_number: nextNumber,
          weight: 0,
          reps: 0,
          status: 'planned',
        },
        { requestKey: null }
      );

      setSets((prev) => ({
        ...prev,
        [workoutExerciseId]: [...(prev[workoutExerciseId] || []), newSet],
      }));
    } catch (e) {
      console.error('Ошибка создания подхода:', e);
      alert('Ошибка: ' + e.message);
    }
  };

  const updateSet = async (setId, field, value) => {
    try {
      const updatedSet = await pb.collection('sets').update(
        setId,
        { [field]: value },
        { requestKey: null }
      );

      setSets((prev) => {
        const newSets = { ...prev };
        for (const exId in newSets) {
          newSets[exId] = newSets[exId].map((s) => (s.id === setId ? updatedSet : s));
        }
        return newSets;
      });
    } catch (e) {
      console.error('Ошибка обновления подхода:', e);
    }
  };

  const deleteSet = async (setId, workoutExerciseId) => {
    if (!confirm('Удалить подход?')) return;
    try {
      await pb.collection('sets').delete(setId, { requestKey: null });
      setSets((prev) => ({
        ...prev,
        [workoutExerciseId]: (prev[workoutExerciseId] || []).filter((s) => s.id !== setId),
      }));
    } catch (e) {
      console.error('Ошибка удаления подхода:', e);
    }
  };

  const deleteWorkoutExercise = async (workoutExerciseId) => {
    if (!confirm('Удалить упражнение из тренировки?')) return;
    try {
      const currentSets = sets[workoutExerciseId] || [];
      for (const s of currentSets) {
        try {
          await pb.collection('sets').delete(s.id, { requestKey: null });
        } catch {
          // ignore
        }
      }

      await pb.collection('workout_exercises').delete(workoutExerciseId, { requestKey: null });

      setExercises((prev) => prev.filter((x) => x.id !== workoutExerciseId));
      setSets((prev) => {
        const copy = { ...prev };
        delete copy[workoutExerciseId];
        return copy;
      });
    } catch (e) {
      console.error('Ошибка удаления упражнения:', e);
      alert('Не удалось удалить упражнение');
    }
  };

  const addExerciseToWorkout = async () => {
    if (!addSelected) return;
    const picked = myExerciseOptions.find((o) => o.key === addSelected);
    if (!picked) return;

    try {
      setAddingExercise(true);
      const nextOrder = exercises.reduce((m, e) => Math.max(m, e.order_index ?? 0), 0) + 1;

      const payload = {
        workout: workoutId,
        order_index: nextOrder,
      };

      if (picked.type === 'public') payload.exercise = picked.exerciseId;
      if (picked.type === 'custom') payload.custom_name = picked.customName || picked.label;

      const created = await pb.collection('workout_exercises').create(payload, {
        requestKey: null,
      });

      const fresh = await pb.collection('workout_exercises').getOne(created.id, {
        expand: 'exercise',
        requestKey: null,
      });

      setExercises((prev) => [...prev, fresh].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)));
      setSets((prev) => ({ ...prev, [fresh.id]: [] }));

      setAddSelected('');
      setAddOpenFor(null);
    } catch (e) {
      console.error('Ошибка добавления упражнения:', e);
      alert('Не удалось добавить упражнение');
    } finally {
      setAddingExercise(false);
    }
  };

  const canShowInlineExerciseActions = isInline;

  const addOptions = useMemo(() => {
    return myExerciseOptions.map((o) => (
      <option key={o.key} value={o.key}>
        {o.label}
      </option>
    ));
  }, [myExerciseOptions]);

  if (loading) return <div className={styles.loadingContainer}>Загрузка...</div>;
  if (error) return <div className={styles.errorContainer}>{error}</div>;
  if (!workout) return <div className={styles.notFoundContainer}>Тренировка не найдена</div>;

  return (
    <div className={isInline ? styles.inlineVariant : styles.pageVariant}>
      {isInline ? (
        showMeta ? (
        <div className={styles.inlineMeta}>
          <div className={styles.inlineTitle}>{workout.title || 'Тренировка'}</div>
          <div className={styles.inlineDate}>
            {new Date(workout.date).toLocaleDateString('ru-RU')}
          </div>
        </div>
        ) : null
      ) : (
        <>
          <div className={styles.header}>
            <h1 className={styles.title}>{workout.title || 'Тренировка'}</h1>
          </div>

          <div className={styles.date}>
            📅 {new Date(workout.date).toLocaleDateString('ru-RU')}
          </div>
        </>
      )}

      {workout.notes && (
        <div className={styles.notes}>
          <p className={styles.notesText}>📝 {workout.notes}</p>
        </div>
      )}

      {!isInline && <h2 className={styles.sectionTitle}>Упражнения и подходы</h2>}

      {exercises.length === 0 ? (
        <div className={styles.emptyMessage}>В этой тренировке пока нет упражнений</div>
      ) : (
        <div className={styles.exerciseGrid}>
          {exercises.map((we, index) => {
            const exerciseSets = sets[we.id] || [];
            const exerciseName = we.expand?.exercise?.exercise_name || we.custom_name || 'Упражнение';
            const muscleGroup = we.expand?.exercise?.muscle_group;

            return (
              <div key={we.id} className={styles.exerciseCard}>
                {canShowInlineExerciseActions && (
                  <button
                    type="button"
                    className={styles.removeExerciseBtnTop}
                    onClick={() => deleteWorkoutExercise(we.id)}
                  >
                    Удалить упражнение
                  </button>
                )}
                <div className={styles.exerciseHeader}>
                  <span className={styles.exerciseNumber}>{index + 1}.</span>
                  <h3 className={styles.exerciseName}>{exerciseName}</h3>
                  {muscleGroup && <span className={styles.muscleGroup}>{muscleGroup}</span>}
                </div>

                {we.notes && <div className={styles.exerciseNotes}>📝 {we.notes}</div>}

                {exerciseSets.length > 0 ? (
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>№</th>
                          <th>Weight</th>
                          <th>Reps</th>
                          <th>Status</th>
                          <th>RPE</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exerciseSets.map((set) => (
                          <tr key={set.id}>
                            <td className={styles.setNumber}>{set.set_number}</td>
                            <td>
                              <input
                                type="number"
                                value={set.weight}
                                onChange={(e) =>
                                  updateSet(set.id, 'weight', parseFloat(e.target.value) || 0)
                                }
                                className={styles.inputSmall}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={set.reps}
                                onChange={(e) =>
                                  updateSet(set.id, 'reps', parseInt(e.target.value) || 0)
                                }
                                className={styles.inputSmall}
                              />
                            </td>
                            <td>
                              <select
                                value={set.status}
                                onChange={(e) => updateSet(set.id, 'status', e.target.value)}
                                className={styles.selectSmall}
                              >
                                <option value="planned">Запланирован</option>
                                <option value="completed">Выполнен</option>
                                <option value="failed">Неудача</option>
                                <option value="skipped">Пропущен</option>
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={set.rpe || ''}
                                onChange={(e) =>
                                  updateSet(set.id, 'rpe', parseInt(e.target.value) || null)
                                }
                                className={styles.inputTiny}
                                placeholder="-"
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => deleteSet(set.id, we.id)}
                                className={styles.deleteBtn}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={styles.emptyMessage}>Пока нет подходов</div>
                )}

                {canShowInlineExerciseActions && (
                  <div className={styles.exerciseBottomActions}>
                    <button
                      type="button"
                      onClick={() => addSet(we.id)}
                      className={styles.addSetBtnBottom}
                    >
                      + Добавить подход
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAddOpenFor((prev) => (prev === we.id ? null : we.id));
                        setAddSelected("");
                      }}
                      className={styles.addExerciseBtnBottom}
                    >
                      Добавить упражнение
                    </button>
                  </div>
                )}


                {canShowInlineExerciseActions && addOpenFor === we.id && (
                  <div className={styles.addExercisePanel}>
                    <select
                      value={addSelected}
                      onChange={(e) => setAddSelected(e.target.value)}
                      className={styles.addExerciseSelect}
                    >
                      <option value="">
                        {loadingMyExercises ? "Загрузка…" : "Выберите упражнение…"}
                      </option>
                      {addOptions}
                    </select>

                    <button
                      type="button"
                      onClick={addExerciseToWorkout}
                      className={styles.addExerciseConfirmBtn}
                      disabled={addingExercise || !addSelected}
                    >
                      {addingExercise ? "Добавление…" : "Добавить"}
                    </button>
                  </div>
                )}

                {!isInline && (
                  <button type="button" onClick={() => addSet(we.id)} className={styles.addSetBtn}>
                    + Добавить подход
                  </button>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkoutDetailContent;

