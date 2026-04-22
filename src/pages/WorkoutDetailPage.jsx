// src/pages/WorkoutDetailPage.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';
import Header from '../components/layout/Header';
import styles from './WorkoutDetailPage.module.css';

function WorkoutDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [sets, setSets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadAllData = async () => {
      try {
        setLoading(true);
        setError('');

        // 1. Загружаем тренировку
        const workoutData = await pb.collection('workouts').getOne(id, {
          requestKey: null
        });

        // 2. Загружаем упражнения в тренировке
        const exercisesData = await pb.collection('workout_exercises').getFullList({
          filter: `workout = "${id}"`,
          expand: 'exercise',
          sort: 'order_index',
          requestKey: null
        });

        // 3. Для каждого упражнения загружаем подходы
        const setsMap = {};
        for (const ex of exercisesData) {
          const setsData = await pb.collection('sets').getFullList({
            filter: `workout_exercise = "${ex.id}"`,
            sort: 'set_number',
            requestKey: null
          });
          setsMap[ex.id] = setsData;
        }

        if (isMounted) {
          setWorkout(workoutData);
          setExercises(exercisesData);
          setSets(setsMap);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Ошибка загрузки:', error);
          setError('Не удалось загрузить данные тренировки: ' + error.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAllData();

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Функция создания нового подхода
  const addSet = async (workoutExerciseId) => {
    try {
      const existingSets = sets[workoutExerciseId] || [];
      const nextNumber = existingSets.length + 1;

      const newSet = await pb.collection('sets').create({
        workout_exercise: workoutExerciseId,
        set_number: nextNumber,
        weight: 0,
        reps: 0,
        status: 'planned'
      }, { requestKey: null });

      setSets(prev => ({
        ...prev,
        [workoutExerciseId]: [...(prev[workoutExerciseId] || []), newSet]
      }));
    } catch (error) {
      console.error('Ошибка создания подхода:', error);
      alert('Ошибка: ' + error.message);
    }
  };

  // Функция обновления подхода
  const updateSet = async (setId, field, value) => {
    try {
      const updatedSet = await pb.collection('sets').update(setId, {
        [field]: value
      }, { requestKey: null });

      setSets(prev => {
        const newSets = { ...prev };
        for (const exId in newSets) {
          newSets[exId] = newSets[exId].map(s =>
            s.id === setId ? updatedSet : s
          );
        }
        return newSets;
      });
    } catch (error) {
      console.error('Ошибка обновления подхода:', error);
    }
  };

  // Функция удаления подхода
  const deleteSet = async (setId, workoutExerciseId) => {
    if (!confirm('Удалить подход?')) return;

    try {
      await pb.collection('sets').delete(setId, { requestKey: null });

      setSets(prev => ({
        ...prev,
        [workoutExerciseId]: prev[workoutExerciseId].filter(s => s.id !== setId)
      }));
    } catch (error) {
      console.error('Ошибка удаления подхода:', error);
    }
  };

  // Функция для получения класса статуса
  const getStatusClass = (status) => {
    switch (status) {
      case 'completed': return styles.statusCompleted;
      case 'failed': return styles.statusFailed;
      case 'skipped': return styles.statusSkipped;
      default: return styles.statusPlanned;
    }
  };

  if (loading) return (
    <>
      <Header />
      <div className={styles.loadingContainer}>⏳ Загрузка...</div>
    </>
  );

  if (error) return (
    <>
      <Header />
      <div className={styles.errorContainer}>❌ {error}</div>
    </>
  );

  if (!workout) return (
    <>
      <Header />
      <div className={styles.notFoundContainer}>❌ Тренировка не найдена</div>
    </>
  );

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>{workout.title || 'Тренировка'}</h1>
          <button
            onClick={() => navigate(`/workouts/${id}/edit`)}
            className={styles.editBtn}
          >
            ✏️ Редактировать
          </button>
        </div>

        <div className={styles.date}>
          📅 {new Date(workout.date).toLocaleDateString('ru-RU')}
        </div>

        {workout.notes && (
          <div className={styles.notes}>
            <p className={styles.notesText}>📝 {workout.notes}</p>
          </div>
        )}

        <h2 className={styles.sectionTitle}>🏋️ Упражнения и подходы</h2>

        {exercises.length === 0 ? (
          <div className={styles.emptyMessage}>
            В этой тренировке пока нет упражнений
          </div>
        ) : (
          <div className={styles.exerciseGrid}>
            {exercises.map((we, index) => {
              const exerciseSets = sets[we.id] || [];
              const exerciseName = we.expand?.exercise?.exercise_name || we.custom_name || 'Упражнение';
              const muscleGroup = we.expand?.exercise?.muscle_group;

              return (
                <div key={we.id} className={styles.exerciseCard}>
                  <div className={styles.exerciseHeader}>
                    <span className={styles.exerciseNumber}>{index + 1}.</span>
                    <h3 className={styles.exerciseName}>{exerciseName}</h3>
                    {muscleGroup && (
                      <span className={styles.muscleGroup}>{muscleGroup}</span>
                    )}
                  </div>

                  {we.notes && (
                    <div className={styles.exerciseNotes}>
                      📝 {we.notes}
                    </div>
                  )}

                  {exerciseSets.length > 0 ? (
                    <div className={styles.tableContainer}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>№</th>
                            <th>Вес (кг)</th>
                            <th>Повторения</th>
                            <th>Статус</th>
                            <th>RPE</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exerciseSets.map(set => (
                            <tr key={set.id}>
                              <td className={styles.setNumber}>{set.set_number}</td>
                              <td>
                                <input
                                  type="number"
                                  value={set.weight}
                                  onChange={(e) => updateSet(set.id, 'weight', parseFloat(e.target.value) || 0)}
                                  className={styles.inputSmall}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={set.reps}
                                  onChange={(e) => updateSet(set.id, 'reps', parseInt(e.target.value) || 0)}
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
                                {/* Можно также показывать badge вместо select для просмотра */}
                                {/* <span className={getStatusClass(set.status)}>
                                  {set.status === 'planned' && 'Запланирован'}
                                  {set.status === 'completed' && 'Выполнен'}
                                  {set.status === 'failed' && 'Неудача'}
                                  {set.status === 'skipped' && 'Пропущен'}
                                </span> */}
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="1"
                                  max="10"
                                  value={set.rpe || ''}
                                  onChange={(e) => updateSet(set.id, 'rpe', parseInt(e.target.value) || null)}
                                  className={styles.inputTiny}
                                  placeholder="-"
                                />
                              </td>
                              <td>
                                <button
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
                    <div className={styles.emptyMessage}>
                      Пока нет подходов
                    </div>
                  )}

                  <button
                    onClick={() => addSet(we.id)}
                    className={styles.addSetBtn}
                  >
                    + Добавить подход
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkoutDetailPage;