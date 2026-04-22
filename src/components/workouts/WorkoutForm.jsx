// src/components/workouts/WorkoutForm.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import styles from './WorkoutForm.module.css';

function WorkoutForm() {
  const navigate = useNavigate();
  const { id } = useParams(); // id тренировки если редактирование
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [exercisesList, setExercisesList] = useState([]);

  // Основные поля тренировки
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    notes: ''
  });
  const [dateInputType, setDateInputType] = useState('text');

  // Упражнения с подходами
  const [exercises, setExercises] = useState([]);
  const [expandedExercise, setExpandedExercise] = useState(null);

  // Загружаем список упражнений из справочника
  useEffect(() => {
    const loadExercises = async () => {
      try {
        const records = await pb.collection('exercises').getFullList({
          sort: 'exercise_name',
          requestKey: null
        });
        setExercisesList(records);
      } catch (error) {
        console.error('Ошибка загрузки упражнений:', error);
      }
    };
    loadExercises();
  }, []);

  // Загружаем данные тренировки при редактировании
  useEffect(() => {
    if (!isEdit) return;

    const loadWorkoutData = async () => {
      try {
        // Загружаем тренировку
        const workout = await pb.collection('workouts').getOne(id, {
          requestKey: null
        });

        setFormData({
          title: workout.title || '',
          date: workout.date.split('T')[0],
          notes: workout.notes || ''
        });
        setDateInputType('date');

        // Загружаем упражнения тренировки
        const workoutExercises = await pb.collection('workout_exercises').getFullList({
          filter: `workout = "${id}"`,
          sort: 'order_index',
          expand: 'exercise',
          requestKey: null
        });

        // Загружаем подходы для каждого упражнения
        const exercisesWithSets = await Promise.all(
          workoutExercises.map(async (we, index) => {
            const sets = await pb.collection('sets').getFullList({
              filter: `workout_exercise = "${we.id}"`,
              sort: 'set_number',
              requestKey: null
            });

            return {
              id: we.id,
              workoutExerciseId: we.id,
              exerciseId: we.exercise || '',
              customName: we.custom_name || '',
              notes: we.notes || '',
              orderIndex: we.order_index || index,
              sets: sets.map(set => ({
                id: set.id,
                setNumber: set.set_number,
                weight: set.weight || 0,
                reps: set.reps || 0,
                status: set.status || 'planned',
                rpe: set.rpe || '',
                notes: set.notes || ''
              }))
            };
          })
        );

        setExercises(exercisesWithSets.sort((a, b) => a.orderIndex - b.orderIndex));
      } catch (error) {
        console.error('Ошибка загрузки данных тренировки:', error);
        alert('Не удалось загрузить данные тренировки');
      } finally {
        setInitialLoading(false);
      }
    };

    loadWorkoutData();
  }, [isEdit, id]);

  // Добавить упражнение
  const addExercise = () => {
    const newExercise = {
      id: null,
      workoutExerciseId: null,
      exerciseId: '',
      customName: '',
      notes: '',
      orderIndex: exercises.length,
      sets: [{ setNumber: 1, weight: 0, reps: 0, status: 'planned', rpe: '', notes: '' }]
    };
    setExercises([...exercises, newExercise]);
    setExpandedExercise(exercises.length);
  };

  // Удалить упражнение
  const removeExercise = async (index) => {
    const exercise = exercises[index];

    if (exercise.workoutExerciseId && !window.confirm('Удалить это упражнение? Все подходы также будут удалены.')) {
      return;
    }

    if (exercise.workoutExerciseId) {
      try {
        await pb.collection('workout_exercises').delete(exercise.workoutExerciseId, { requestKey: null });
      } catch (error) {
        console.error('Ошибка удаления упражнения:', error);
        alert('Не удалось удалить упражнение');
        return;
      }
    }

    const newExercises = exercises.filter((_, i) => i !== index);
    setExercises(newExercises);
  };

  // Обновить упражнение
  const updateExercise = (index, field, value) => {
    const newExercises = [...exercises];
    newExercises[index][field] = value;

    if (field === 'exerciseId' && value) {
      newExercises[index].customName = '';
    }
    if (field === 'customName' && value) {
      newExercises[index].exerciseId = '';
    }

    setExercises(newExercises);
  };

  // Добавить подход
  const addSet = (exerciseIndex) => {
    const newExercises = [...exercises];
    const newSetNumber = newExercises[exerciseIndex].sets.length + 1;
    newExercises[exerciseIndex].sets.push({
      id: null,
      setNumber: newSetNumber,
      weight: 0,
      reps: 0,
      status: 'planned',
      rpe: '',
      notes: ''
    });
    setExercises(newExercises);
  };

  // Обновить подход
  const updateSet = (exerciseIndex, setIndex, field, value) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex].sets[setIndex][field] = value;
    setExercises(newExercises);
  };

  // Удалить подход
  const removeSet = (exerciseIndex, setIndex) => {
    if (!window.confirm('Удалить подход?')) return;

    const newExercises = [...exercises];
    newExercises[exerciseIndex].sets = newExercises[exerciseIndex].sets.filter((_, i) => i !== setIndex);

    // Перенумеровать подходы
    newExercises[exerciseIndex].sets.forEach((set, idx) => {
      set.setNumber = idx + 1;
    });

    setExercises(newExercises);
  };

  // Сохранить тренировку
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let workout;

      if (isEdit) {
        // Обновляем тренировку
        workout = await pb.collection('workouts').update(id, {
          title: formData.title || `Тренировка ${formData.date}`,
          date: formData.date,
          notes: formData.notes
        }, { requestKey: null });
      } else {
        // Создаём тренировку
        workout = await pb.collection('workouts').create({
          user: pb.authStore.model.id,
          title: formData.title || `Тренировка ${formData.date}`,
          date: formData.date,
          notes: formData.notes
        }, { requestKey: null });
      }

      // Сохраняем упражнения и подходы
      await saveExercisesAndSets(workout.id);

      alert(isEdit ? 'Тренировка обновлена!' : 'Тренировка создана!');
      navigate(`/workouts/${workout.id}`);
    } catch (error) {
      console.error('❌ Ошибка:', error);
      alert('Ошибка: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Сохранить упражнения и подходы
  const saveExercisesAndSets = async (workoutId) => {
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];

      // Пропускаем пустые упражнения
      if (!ex.exerciseId && !ex.customName) continue;

      let workoutExerciseId = ex.workoutExerciseId;

      const exerciseData = {
        workout: workoutId,
        order_index: i,
        notes: ex.notes || ''
      };

      if (ex.exerciseId) {
        exerciseData.exercise = ex.exerciseId;
        exerciseData.custom_name = '';
      } else if (ex.customName) {
        exerciseData.custom_name = ex.customName;
        exerciseData.exercise = null;
      }

      // Создаём или обновляем упражнение
      if (workoutExerciseId) {
        await pb.collection('workout_exercises').update(workoutExerciseId, exerciseData, { requestKey: null });
      } else {
        const created = await pb.collection('workout_exercises').create(exerciseData, { requestKey: null });
        workoutExerciseId = created.id;
      }

      // Сохраняем подходы
      for (let j = 0; j < ex.sets.length; j++) {
        const set = ex.sets[j];
        const setData = {
          workout_exercise: workoutExerciseId,
          set_number: j + 1,
          weight: set.weight || 0,
          reps: set.reps || 0,
          status: set.status || 'planned',
          rpe: set.rpe || null,
          notes: set.notes || ''
        };

        if (set.id) {
          await pb.collection('sets').update(set.id, setData, { requestKey: null });
        } else {
          await pb.collection('sets').create(setData, { requestKey: null });
        }
      }
    }
  };

  if (initialLoading) {
    return <div className={styles.loadingContainer}>⏳ Загрузка тренировки...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* Основные поля */}
      <div className={styles.formGroup}>
        <input
          type="text"
          placeholder="Workout name (optional)"
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          className={styles.input}
        />
      </div>

      <div className={styles.formGroup}>
        <input
          type={dateInputType}
          placeholder="Date"
          value={formData.date}
          onChange={(e) => setFormData({...formData, date: e.target.value})}
          onFocus={() => setDateInputType('date')}
          onBlur={() => {
            if (!formData.date) setDateInputType('text');
          }}
          className={styles.input}
          required
        />
      </div>

      <div className={styles.formGroup}>
        <textarea
          placeholder="Workout notes (optional)"
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          rows="3"
          className={styles.textarea}
        />
      </div>

      {/* Упражнения */}
      <div className={styles.formSection}>
        <div className={styles.sectionHeader}>
          <button type="button" onClick={addExercise} className={styles.addExerciseBtn}>
            + Добавить упражнение
          </button>
        </div>

        {exercises.map((exercise, exIndex) => (
          <div key={exIndex} className={styles.exerciseCard}>
            <div className={styles.exerciseHeader}>
              <div className={styles.exerciseSelectRow}>
                <select
                  value={exercise.exerciseId}
                  onChange={(e) => updateExercise(exIndex, 'exerciseId', e.target.value)}
                  className={styles.exerciseSelect}
                >
                  <option value="">Select exercise…</option>
                  {exercisesList.map(ex => (
                    <option key={ex.id} value={ex.id}>
                      {ex.exercise_name} {ex.muscle_group ? `(${ex.muscle_group})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Custom name…"
                  value={exercise.customName}
                  onChange={(e) => updateExercise(exIndex, 'customName', e.target.value)}
                  className={styles.exerciseInput}
                />
                <button
                  type="button"
                  onClick={() => removeExercise(exIndex)}
                  className={styles.removeExerciseBtn}
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                placeholder="Exercise notes…"
                value={exercise.notes}
                onChange={(e) => updateExercise(exIndex, 'notes', e.target.value)}
                className={styles.exerciseNotesInput}
              />
            </div>

            {/* Таблица подходов */}
            <div className={styles.setsTable}>
              <table>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Вес (кг)</th>
                    <th>Повторения</th>
                    <th>Статус</th>
                    <th>RPE (1-10)</th>
                    <th>Заметки</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {exercise.sets.map((set, setIndex) => (
                    <tr key={setIndex}>
                      <td className={styles.setNumber}>{set.setNumber}</td>
                      <td>
                        <input
                          type="number"
                          value={set.weight}
                          onChange={(e) => updateSet(exIndex, setIndex, 'weight', parseFloat(e.target.value) || 0)}
                          className={styles.setInput}
                          placeholder="кг"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={set.reps}
                          onChange={(e) => updateSet(exIndex, setIndex, 'reps', parseInt(e.target.value) || 0)}
                          className={styles.setInput}
                          placeholder="раз"
                        />
                      </td>
                      <td>
                        <select
                          value={set.status}
                          onChange={(e) => updateSet(exIndex, setIndex, 'status', e.target.value)}
                          className={styles.statusSelect}
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
                          value={set.rpe}
                          onChange={(e) => updateSet(exIndex, setIndex, 'rpe', parseInt(e.target.value) || '')}
                          className={styles.rpeInput}
                          placeholder="-"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={set.notes}
                          onChange={(e) => updateSet(exIndex, setIndex, 'notes', e.target.value)}
                          className={styles.setNotesInput}
                          placeholder="..."
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeSet(exIndex, setIndex)}
                          className={styles.removeSetBtn}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => addSet(exIndex)}
                className={styles.addSetBtn}
              >
                + Добавить подход
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Кнопки формы */}
      <div className={styles.formActions}>
        <button type="submit" disabled={loading} className={styles.submitBtn}>
          {loading
            ? 'Сохранение...'
            : isEdit
              ? 'Сохранить изменения'
              : 'Создать тренировку'}
        </button>
        <button type="button" onClick={() => navigate(-1)} className={styles.cancelBtn}>
          Отмена
        </button>
      </div>
    </form>
  );
}

export default WorkoutForm;