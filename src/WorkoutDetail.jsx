import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import pb from './lib/pocketbase';

function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [sets, setSets] = useState({}); // объект: id упражнения -> массив подходов
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Загружаем все данные
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
      // Определяем следующий номер подхода
      const existingSets = sets[workoutExerciseId] || [];
      const nextNumber = existingSets.length + 1;

      const newSet = await pb.collection('sets').create({
        workout_exercise: workoutExerciseId,
        set_number: nextNumber,
        weight: 0,
        reps: 0,
        status: 'planned'
      });

      // Обновляем состояние
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
      });

      // Обновляем состояние
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
      await pb.collection('sets').delete(setId);

      // Обновляем состояние
      setSets(prev => ({
        ...prev,
        [workoutExerciseId]: prev[workoutExerciseId].filter(s => s.id !== setId)
      }));
    } catch (error) {
      console.error('Ошибка удаления подхода:', error);
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>⏳ Загрузка...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>❌ {error}</div>;
  if (!workout) return <div style={{ padding: '20px' }}>❌ Тренировка не найдена</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          padding: '8px 16px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        ← Назад
      </button>

      <h1 style={{ color: '#333', borderBottom: '2px solid #4CAF50', paddingBottom: '10px' }}>
        {workout.title}
      </h1>

      <p style={{ color: '#666', fontSize: '18px' }}>
        📅 {new Date(workout.date).toLocaleDateString()}
      </p>

      {workout.notes && (
        <p style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '5px' }}>
          📝 {workout.notes}
        </p>
      )}

      <h2 style={{ marginTop: '30px' }}>🏋️ Упражнения и подходы</h2>

      {exercises.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>
          В этой тренировке пока нет упражнений
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '30px' }}>
          {exercises.map((we, index) => {
            const exerciseSets = sets[we.id] || [];

            return (
              <div
                key={we.id}
                style={{
                  padding: '20px',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #ddd',
                  borderRadius: '5px'
                }}
              >
                <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>
                  {index + 1}. {we.expand?.exercise?.exercise_name || we.custom_name || 'Упражнение'}
                  {we.expand?.exercise?.muscle_group &&
                    ` (${we.expand.exercise.muscle_group})`
                  }
                </h3>

                {we.notes && (
                  <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
                    📝 {we.notes}
                  </p>
                )}

                {/* Таблица подходов */}
                {exerciseSets.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e0e0e0' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>№</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Вес (кг)</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Повторения</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Статус</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>RPE</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exerciseSets.map(set => (
                          <tr key={set.id} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '8px' }}>{set.set_number}</td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                value={set.weight}
                                onChange={(e) => updateSet(set.id, 'weight', parseFloat(e.target.value) || 0)}
                                style={{ width: '70px', padding: '4px' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                value={set.reps}
                                onChange={(e) => updateSet(set.id, 'reps', parseInt(e.target.value) || 0)}
                                style={{ width: '70px', padding: '4px' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <select
                                value={set.status}
                                onChange={(e) => updateSet(set.id, 'status', e.target.value)}
                                style={{ padding: '4px' }}
                              >
                                <option value="planned">Запланирован</option>
                                <option value="completed">Выполнен</option>
                                <option value="failed">Неудача</option>
                                <option value="skipped">Пропущен</option>
                              </select>
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={set.rpe || ''}
                                onChange={(e) => updateSet(set.id, 'rpe', parseInt(e.target.value) || null)}
                                style={{ width: '50px', padding: '4px' }}
                                placeholder="-"
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <button
                                onClick={() => deleteSet(set.id, we.id)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#f44336',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: 'pointer'
                                }}
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
                  <p style={{ color: '#999', fontStyle: 'italic' }}>
                    Пока нет подходов
                  </p>
                )}

                {/* Кнопка добавления подхода */}
                <button
                  onClick={() => addSet(we.id)}
                  style={{
                    marginTop: '15px',
                    padding: '8px 16px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  + Добавить подход
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkoutDetail;