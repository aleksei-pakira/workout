import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import { useExerciseDropdownSource } from '../hooks/useExerciseDropdownSource';
import {
  createEmptyBlock,
  createEmptyVariantSlot,
  getEditCarouselVariantCount,
  MAIN_VARIANT_INDEX,
} from '../lib/workoutVariantConstants';
import {
  loadWorkoutBlocks,
  normalizeBlockDraftFromApi,
  syncWorkoutBlocksFromDraft,
} from '../lib/workoutVariants';
import ExerciseSourceTabs from '../components/exercises/ExerciseSourceTabs';
import ExerciseVariantCarousel from '../components/workouts/ExerciseVariantCarousel';
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

  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftExercises, setDraftExercises] = useState([]);
  const [openExerciseDropdown, setOpenExerciseDropdown] = useState(null);
  const {
    exerciseSource,
    setExerciseSource,
    visibleExercises,
    loading: exercisesLoading,
    error: exercisesError,
    ensureLoaded: ensureExerciseSourcesLoaded,
  } = useExerciseDropdownSource();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);

        const w = await pb.collection('workouts').getOne(id, { requestKey: null });
        if (!mounted) return;

        if (user?.id && w?.user && w.user !== user.id) {
          setError('Нет доступа к этой тренировке');
          setWorkout(null);
          return;
        }

        setWorkout(w);

        const { blocks } = await loadWorkoutBlocks(id);
        if (!mounted) return;

        const nextDraftExercises = blocks.map((block) =>
          normalizeBlockDraftFromApi(block.we, block.variants, block.setsByVariantId)
        );

        setDraftTitle(w.title || '');
        setDraftNotes(w.notes || '');
        setDraftExercises(nextDraftExercises.length > 0 ? nextDraftExercises : [createEmptyBlock(1)]);
      } catch (e) {
        console.error('Ошибка загрузки тренировки для редактирования:', e);
        if (!mounted) return;
        setError('Не удалось загрузить тренировку');
        setWorkout(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [id, user?.id]);

  const ensureVariantSlot = (block, variantIndex) => {
    if (block.variants?.[variantIndex]) return block;
    return {
      ...block,
      variants: {
        ...block.variants,
        [variantIndex]: createEmptyVariantSlot(variantIndex),
      },
    };
  };

  const getActiveVariant = (block) => {
    const idx = block.activeVariantIndex ?? MAIN_VARIANT_INDEX;
    return block.variants?.[idx] || createEmptyVariantSlot(idx);
  };

  const updateDraftVariant = (blockIdx, variantIndex, patch) => {
    setDraftExercises((prev) =>
      prev.map((block, i) => {
        if (i !== blockIdx) return block;
        const withSlot = ensureVariantSlot(block, variantIndex);
        const current = withSlot.variants[variantIndex];
        return {
          ...withSlot,
          variants: {
            ...withSlot.variants,
            [variantIndex]: { ...current, ...patch },
          },
        };
      })
    );
  };

  const updateDraftSet = (blockIdx, variantIndex, setIdx, field, value) => {
    setDraftExercises((prev) =>
      prev.map((block, i) => {
        if (i !== blockIdx) return block;
        const withSlot = ensureVariantSlot(block, variantIndex);
        const variant = withSlot.variants[variantIndex];
        const nextSets = (variant.sets || []).map((s, j) =>
          j === setIdx ? { ...s, [field]: value } : s
        );
        return {
          ...withSlot,
          variants: {
            ...withSlot.variants,
            [variantIndex]: { ...variant, sets: nextSets },
          },
        };
      })
    );
  };

  const addDraftSet = (blockIdx, variantIndex) => {
    setDraftExercises((prev) =>
      prev.map((block, i) => {
        if (i !== blockIdx) return block;
        const withSlot = ensureVariantSlot(block, variantIndex);
        const variant = withSlot.variants[variantIndex];
        const sets = variant.sets || [];
        const nextSets = [
          ...sets,
          { set_number: sets.length + 1, weight: '', reps: '', status: 'planned' },
        ];
        return {
          ...withSlot,
          variants: {
            ...withSlot.variants,
            [variantIndex]: { ...variant, sets: nextSets },
          },
        };
      })
    );
  };

  const removeDraftSet = (blockIdx, variantIndex, setIdx) => {
    setDraftExercises((prev) =>
      prev.map((block, i) => {
        if (i !== blockIdx) return block;
        const withSlot = ensureVariantSlot(block, variantIndex);
        const variant = withSlot.variants[variantIndex];
        const sets = variant.sets || [];
        if (sets.length <= 1) return block;
        const nextSets = sets
          .filter((_, j) => j !== setIdx)
          .map((s, j) => ({ ...s, set_number: j + 1 }));
        return {
          ...withSlot,
          variants: {
            ...withSlot.variants,
            [variantIndex]: { ...variant, sets: nextSets },
          },
        };
      })
    );
  };

  const addDraftExercise = () => {
    setDraftExercises((prev) => [...prev, createEmptyBlock(prev.length + 1)]);
    setOpenExerciseDropdown(null);
  };

  const removeDraftExercise = (blockIdx) => {
    setDraftExercises((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== blockIdx);
    });

    setOpenExerciseDropdown((prev) => {
      if (!prev) return null;
      if (prev.blockIdx === blockIdx) return null;
      if (prev.blockIdx > blockIdx) return { ...prev, blockIdx: prev.blockIdx - 1 };
      return prev;
    });
  };

  const changeActiveVariant = (blockIdx, nextIndex) => {
    setDraftExercises((prev) =>
      prev.map((block, i) => {
        if (i !== blockIdx) return block;
        return ensureVariantSlot({ ...block, activeVariantIndex: nextIndex }, nextIndex);
      })
    );
    setOpenExerciseDropdown(null);
  };

  const toggleExerciseDropdown = async (blockIdx, variantIndex) => {
    const isOpen =
      openExerciseDropdown?.blockIdx === blockIdx &&
      openExerciseDropdown?.variantIndex === variantIndex;
    setOpenExerciseDropdown(isOpen ? null : { blockIdx, variantIndex });
    if (!isOpen) await ensureExerciseSourcesLoaded();
  };

  const isDropdownOpen = (blockIdx, variantIndex) =>
    openExerciseDropdown?.blockIdx === blockIdx &&
    openExerciseDropdown?.variantIndex === variantIndex;

  const canSave = useMemo(
    () =>
      draftExercises.length > 0 &&
      draftExercises.every((block) => Boolean(block.variants?.[MAIN_VARIANT_INDEX]?.exerciseId)),
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

      await syncWorkoutBlocksFromDraft({
        workoutId: id,
        draftBlocks: draftExercises,
      });

      setOpenExerciseDropdown(null);
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
        requestKey: null,
      });

      if (currentWe.length > 0) {
        await Promise.all(
          currentWe.map((we) => pb.collection('workout_exercises').delete(we.id, { requestKey: null }))
        );
      }

      await pb.collection('workouts').delete(id, { requestKey: null });

      setOpenExerciseDropdown(null);
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
                draftExercises.map((exBlock, exIdx) => {
                  const activeVariantIndex = exBlock.activeVariantIndex ?? MAIN_VARIANT_INDEX;
                  const activeVariant = getActiveVariant(exBlock);
                  const variantCount = getEditCarouselVariantCount(exBlock.variants);

                  return (
                    <div key={exIdx} className={styles.exerciseBlock}>
                      <ExerciseVariantCarousel
                        variantIndex={activeVariantIndex}
                        variantCount={variantCount}
                        mode="edit"
                        onPrev={() => changeActiveVariant(exIdx, activeVariantIndex - 1)}
                        onNext={() => changeActiveVariant(exIdx, activeVariantIndex + 1)}
                      />

                      <div className={styles.exerciseRow}>
                        <div className={styles.exerciseIndex}>{exIdx + 1}</div>
                        <button
                          type="button"
                          className={styles.exerciseNameBtn}
                          onClick={() => toggleExerciseDropdown(exIdx, activeVariantIndex)}
                          title={activeVariant.exerciseName}
                        >
                          {activeVariant.exerciseName || 'Выберите упражнение'}
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

                      {isDropdownOpen(exIdx, activeVariantIndex) && (
                        <div className={styles.exerciseDropdown}>
                          <ExerciseSourceTabs value={exerciseSource} onChange={setExerciseSource} />
                          {exercisesLoading ? (
                            <div className={styles.dropdownMsg}>Загрузка…</div>
                          ) : exercisesError ? (
                            <div className={styles.dropdownError}>{exercisesError}</div>
                          ) : visibleExercises.length === 0 ? (
                            <div className={styles.dropdownMsg}>Нет упражнений</div>
                          ) : (
                            <div className={styles.dropdownList}>
                              {visibleExercises.map((ex) => (
                                <button
                                  key={ex.id}
                                  type="button"
                                  className={styles.dropdownItem}
                                  onClick={() => {
                                    updateDraftVariant(exIdx, activeVariantIndex, {
                                      exerciseId: ex.id,
                                      exerciseName: ex.exercise_name || '',
                                    });
                                    setOpenExerciseDropdown(null);
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

                        {(activeVariant.sets || []).map((s, setIdx) => (
                          <div key={s.set_number} className={styles.setRowCreate}>
                            <div className={styles.cell}>
                              <input
                                type="number"
                                className={styles.cellInput}
                                value={s.weight}
                                onChange={(e) =>
                                  updateDraftSet(exIdx, activeVariantIndex, setIdx, 'weight', e.target.value)
                                }
                                placeholder="0"
                                inputMode="decimal"
                              />
                            </div>
                            <div className={styles.cell}>
                              <input
                                type="number"
                                className={styles.cellInput}
                                value={s.reps}
                                onChange={(e) =>
                                  updateDraftSet(exIdx, activeVariantIndex, setIdx, 'reps', e.target.value)
                                }
                                placeholder="0"
                                inputMode="numeric"
                              />
                            </div>
                            <div className={styles.cell}>
                              <select
                                className={styles.statusSelect}
                                value={normalizeStatus(s.status)}
                                onChange={(e) =>
                                  updateDraftSet(exIdx, activeVariantIndex, setIdx, 'status', e.target.value)
                                }
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
                              onClick={() => removeDraftSet(exIdx, activeVariantIndex, setIdx)}
                              aria-label="Remove set"
                              disabled={(activeVariant.sets || []).length <= 1}
                            >
                              ×
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          className={styles.addSetBtn}
                          onClick={() => addDraftSet(exIdx, activeVariantIndex)}
                        >
                          + Добавить подход
                        </button>
                      </div>
                    </div>
                  );
                })
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
