import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { isUniqueConstraintError } from '../../lib/permissions';
import { useCoachSession } from '../../hooks/useCoachSession';
import {
  createEmptyBlock,
  createEmptyVariantSlot,
  getEditCarouselVariantCount,
  getSortedVariantIndices,
  getVariantExerciseName,
  getVariantRecordByIndex,
  isVariantFilled,
  MAIN_VARIANT_INDEX,
  resolveActiveVariantIndex,
} from '../../lib/workoutVariantConstants';
import {
  loadWorkoutBlocks,
  saveBlockVariantsAndSets,
  setActiveVariantIndex,
} from '../../lib/workoutVariants';
import {
  DEFAULT_SET_STATUS,
  DEFAULT_WORKOUT_STATUS,
  normalizeSetStatus,
  normalizeWorkoutStatus,
  SET_STATUS_OPTIONS,
  statusToPocketBase,
  WORKOUT_STATUS_OPTIONS,
  workoutStatusToPocketBase,
} from '../../lib/setStatus';
import {
  calcExerciseVolumeFromBlock,
  calcExerciseVolumeFromDraftBlock,
  calcWorkoutVolumeFromBlocks,
  calcWorkoutVolumeFromDraft,
  formatWorkoutVolume,
} from '../../lib/workoutVolume';
import {
  createEmptySetRowForColumns,
  getColumnsFromCustomExercise,
  getExercisePickerLabel,
  isCustomApiVariant,
  isCustomDraftBlock,
  isCustomVariant,
  isCustomBlock,
} from '../../lib/exerciseSetSchema';
import ExerciseSourceTabs from '../exercises/ExerciseSourceTabs';
import DynamicSetTable from '../sets/DynamicSetTable';
import ExerciseVariantCarousel from './ExerciseVariantCarousel';
import { useExerciseDropdownSource } from '../../hooks/useExerciseDropdownSource';
import styles from './CalendarWorkoutForm.module.css';

function getNextDayKey(dayKey) {
  const d = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function CalendarWorkoutForm({ dayKey, onClose, onSaved, onWorkoutStatusChange }) {
  const { authUser, effectiveUserId, canEditPlans } = useCoachSession();
  const user = authUser;
  const dataUserId = effectiveUserId;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dayWorkouts, setDayWorkouts] = useState([]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftWorkoutStatus, setDraftWorkoutStatus] = useState(DEFAULT_WORKOUT_STATUS);
  const [draftExercises, setDraftExercises] = useState(() => [createEmptyBlock(1)]);
  const [saving, setSaving] = useState(false);
  const [workoutStatusSaving, setWorkoutStatusSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [openExerciseDropdown, setOpenExerciseDropdown] = useState(null);
  const {
    exerciseSource,
    setExerciseSource,
    visibleExercises,
    loading: exercisesLoading,
    error: exercisesError,
    ensureLoaded: ensureExerciseSourcesLoaded,
  } = useExerciseDropdownSource(dataUserId);

  const canSave = useMemo(
    () =>
      draftExercises.length > 0 &&
      draftExercises.every((block) => isVariantFilled(block.variants?.[MAIN_VARIANT_INDEX])),
    [draftExercises]
  );

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

  const updateDraftSetValue = (blockIdx, variantIndex, setIdx, colKey, value) => {
    setDraftExercises((prev) =>
      prev.map((block, i) => {
        if (i !== blockIdx) return block;
        const withSlot = ensureVariantSlot(block, variantIndex);
        const variant = withSlot.variants[variantIndex];
        const nextSets = (variant.sets || []).map((s, j) =>
          j === setIdx ? { ...s, values: { ...(s.values || {}), [colKey]: value } } : s
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

  const selectExerciseFromDropdown = (blockIdx, variantIndex, ex) => {
    if (ex.kind === 'custom') {
      const columns = getColumnsFromCustomExercise(ex);
      updateDraftVariant(blockIdx, variantIndex, {
        exerciseId: null,
        customExerciseId: ex.id,
        exerciseKind: 'custom',
        exerciseName: ex.custom_exercise_name || '',
        setColumns: columns,
        sets: [createEmptySetRowForColumns(columns)],
      });
      return;
    }

    updateDraftVariant(blockIdx, variantIndex, {
      exerciseId: ex.id,
      customExerciseId: null,
      exerciseKind: 'classic',
      exerciseName: ex.exercise_name || '',
      setColumns: null,
      sets: [{ set_number: 1, weight: '', reps: '', status: DEFAULT_SET_STATUS }],
    });
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

  const addDraftSet = (blockIdx, variantIndex) => {
    setDraftExercises((prev) =>
      prev.map((block, i) => {
        if (i !== blockIdx) return block;
        const withSlot = ensureVariantSlot(block, variantIndex);
        const variant = withSlot.variants[variantIndex];
        const sets = variant.sets || [];
        const isCustom = isCustomVariant(variant);
        const nextSets = isCustom
          ? [...sets, createEmptySetRowForColumns(variant.setColumns)]
          : [
              ...sets,
              { set_number: sets.length + 1, weight: '', reps: '', status: DEFAULT_SET_STATUS },
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

  const handleSave = async () => {
    if (!canEditPlans) return;
    if (!dataUserId) return;
    if (!dayKey) return;
    if (!draftExercises.length) return;
    if (!draftExercises.every((block) => isVariantFilled(block.variants?.[MAIN_VARIANT_INDEX]))) return;

    const nextDayKey = getNextDayKey(dayKey);
    if (!nextDayKey) return;

    try {
      setSaving(true);
      setSaveError(null);

      // Guard: if workout already exists for this day, don't create duplicates
      const existing = await pb.collection('workouts').getFullList({
        filter: `user = "${dataUserId}" && date >= "${dayKey}" && date < "${nextDayKey}"`,
        sort: '-created',
        requestKey: null,
      });

      if (existing.length > 0) {
        setDayWorkouts(existing);
        return;
      }

      const workout = await pb.collection('workouts').create(
        {
          user: dataUserId,
          date: dayKey,
          title: draftTitle,
          notes: draftNotes,
          workout_status: workoutStatusToPocketBase(draftWorkoutStatus),
        },
        { requestKey: null }
      );

      await Promise.all(
        draftExercises.map((block, exIdx) =>
          saveBlockVariantsAndSets({
            workoutId: workout.id,
            blockDraft: block,
            orderIndex: exIdx + 1,
          })
        )
      );

      const list = await pb.collection('workouts').getFullList({
        filter: `user = "${dataUserId}" && date >= "${dayKey}" && date < "${nextDayKey}"`,
        sort: '-created',
        requestKey: null,
      });

      setDayWorkouts(list);
      setOpenExerciseDropdown(null);
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Ошибка сохранения тренировки:', e);
      console.error('PocketBase error details:', e?.data || e?.response || e);
      if (isUniqueConstraintError(e)) {
        setSaveError('На этот день уже есть тренировка');
        try {
          const existing = await pb.collection('workouts').getFullList({
            filter: `user = "${dataUserId}" && date >= "${dayKey}" && date < "${nextDayKey}"`,
            sort: '-created',
            requestKey: null,
          });
          setDayWorkouts(existing);
        } catch {
          /* ignore */
        }
      } else {
        setSaveError('Не удалось сохранить тренировку');
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!dayKey) return;
      if (!dataUserId) return;
      const nextDayKey = getNextDayKey(dayKey);
      if (!nextDayKey) return;

      try {
        setLoading(true);
        setError(null);

        const list = await pb.collection('workouts').getFullList({
          filter: `user = "${dataUserId}" && date >= "${dayKey}" && date < "${nextDayKey}"`,
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
  }, [dayKey, dataUserId]);

  const activeWorkout = useMemo(() => dayWorkouts[0] || null, [dayWorkouts]);
  const isCreateMode = useMemo(
    () => !loading && dayWorkouts.length === 0,
    [loading, dayWorkouts.length]
  );

  const [loadingWorkoutData, setLoadingWorkoutData] = useState(false);
  const [workoutDataError, setWorkoutDataError] = useState(null);
  const [viewBlocks, setViewBlocks] = useState([]);
  const [activeVariantByWeId, setActiveVariantByWeId] = useState({});

  const workoutVolume = useMemo(
    () => calcWorkoutVolumeFromBlocks(viewBlocks),
    [viewBlocks]
  );

  const draftWorkoutVolume = useMemo(
    () => calcWorkoutVolumeFromDraft(draftExercises),
    [draftExercises]
  );

  useEffect(() => {
    let mounted = true;

    const loadWorkoutData = async () => {
      if (!activeWorkout?.id) {
        setViewBlocks([]);
        setActiveVariantByWeId({});
        setWorkoutDataError(null);
        return;
      }

      try {
        setLoadingWorkoutData(true);
        setWorkoutDataError(null);

        const { blocks } = await loadWorkoutBlocks(activeWorkout.id);

        if (!mounted) return;

        setViewBlocks(blocks);

        const initialActive = {};
        for (const block of blocks) {
          const weId = block.we.id;
          initialActive[weId] = resolveActiveVariantIndex(
            block.variants,
            block.we.active_variant_index ?? MAIN_VARIANT_INDEX
          );
        }
        setActiveVariantByWeId(initialActive);
      } catch (e) {
        console.error('Ошибка загрузки упражнений/подходов:', e);
        if (!mounted) return;
        setWorkoutDataError('Не удалось загрузить упражнения и подходы');
        setViewBlocks([]);
        setActiveVariantByWeId({});
      } finally {
        if (mounted) setLoadingWorkoutData(false);
      }
    };

    loadWorkoutData();
    return () => {
      mounted = false;
    };
  }, [activeWorkout?.id]);

  const updateWorkoutStatus = async (nextStatus) => {
    const workoutId = activeWorkout?.id;
    if (!workoutId) return;

    const normalizedNext = normalizeWorkoutStatus(nextStatus);
    const prevWorkouts = dayWorkouts;
    const prevStatus = normalizeWorkoutStatus(activeWorkout?.workout_status);

    setDayWorkouts((prev) =>
      prev.map((w) =>
        w.id === workoutId ? { ...w, workout_status: workoutStatusToPocketBase(normalizedNext) } : w
      )
    );

    try {
      setWorkoutStatusSaving(true);
      await pb.collection('workouts').update(
        workoutId,
        { workout_status: workoutStatusToPocketBase(normalizedNext) },
        { requestKey: null }
      );
      onWorkoutStatusChange?.(dayKey, normalizedNext);
    } catch (e) {
      console.error('Ошибка обновления статуса тренировки:', e);
      setWorkoutDataError('Не удалось сохранить статус тренировки');
      setDayWorkouts(prevWorkouts.map((w) =>
        w.id === workoutId ? { ...w, workout_status: workoutStatusToPocketBase(prevStatus) } : w
      ));
      onWorkoutStatusChange?.(dayKey, prevStatus);
    } finally {
      setWorkoutStatusSaving(false);
    }
  };

  const changeViewVariant = async (weId, nextVariantIndex) => {
    const prevIndex = activeVariantByWeId[weId];

    setActiveVariantByWeId((prev) => ({ ...prev, [weId]: nextVariantIndex }));

    try {
      if (canEditPlans) {
        await setActiveVariantIndex(weId, nextVariantIndex);
      }
    } catch (e) {
      console.error('Ошибка сохранения активного варианта:', e);
      setWorkoutDataError('Не удалось сохранить активный вариант');
      setActiveVariantByWeId((prev) => ({ ...prev, [weId]: prevIndex }));
    }
  };

  const updateSetStatus = async (variantId, setId, nextStatus) => {
    if (!setId) return;

    const normalizedNext = normalizeSetStatus(nextStatus);

    let prevStatus = DEFAULT_SET_STATUS;
    setViewBlocks((prev) =>
      prev.map((block) => {
        const sets = block.setsByVariantId[variantId];
        if (!sets) return block;
        const prevSet = sets.find((s) => s.id === setId);
        if (prevSet) prevStatus = normalizeSetStatus(prevSet.status);

        return {
          ...block,
          setsByVariantId: {
            ...block.setsByVariantId,
            [variantId]: sets.map((s) =>
              s.id === setId ? { ...s, status: normalizedNext } : s
            ),
          },
        };
      })
    );

    try {
      await pb.collection('sets').update(
        setId,
        { status: statusToPocketBase(normalizedNext) },
        { requestKey: null }
      );
    } catch (e) {
      console.error('Ошибка обновления статуса подхода:', e);
      setWorkoutDataError('Не удалось сохранить статус');
      setViewBlocks((prev) =>
        prev.map((block) => {
          const sets = block.setsByVariantId[variantId];
          if (!sets) return block;
          return {
            ...block,
            setsByVariantId: {
              ...block.setsByVariantId,
              [variantId]: sets.map((s) =>
                s.id === setId ? { ...s, status: prevStatus } : s
              ),
            },
          };
        })
      );
    }
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div className={styles.date}>{dayKey}</div>
          <div className={styles.headerRight}>
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.muted}>Загрузка…</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : isCreateMode && !canEditPlans ? (
            <div className={styles.muted}>
              На этот день нет тренировки. План создаёт тренер — вы сможете отмечать статусы после добавления.
            </div>
          ) : isCreateMode ? (
            <div className={styles.workoutSummary}>
              <div className={styles.workoutTitleRow}>
                <input
                  className={styles.workoutTitleInput}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Workout name"
                />
                <select
                  className={styles.workoutStatusSelect}
                  value={normalizeWorkoutStatus(draftWorkoutStatus)}
                  onChange={(e) => setDraftWorkoutStatus(e.target.value)}
                  aria-label="Статус тренировки"
                >
                  {WORKOUT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <input
                className={styles.workoutNotesInput}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="Workout notes (optional)"
              />

              {draftExercises.map((exBlock, exIdx) => {
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
                                  selectExerciseFromDropdown(exIdx, activeVariantIndex, ex);
                                  setOpenExerciseDropdown(null);
                                }}
                              >
                                {getExercisePickerLabel(ex)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isCustomVariant(activeVariant) ? (
                      <DynamicSetTable
                        columns={activeVariant.setColumns || []}
                        sets={activeVariant.sets || []}
                        mode="edit"
                        onChangeValue={(setIdx, colKey, value) =>
                          updateDraftSetValue(exIdx, activeVariantIndex, setIdx, colKey, value)
                        }
                        onAddSet={() => addDraftSet(exIdx, activeVariantIndex)}
                        onRemoveSet={(setIdx) => removeDraftSet(exIdx, activeVariantIndex, setIdx)}
                      />
                    ) : (
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
                                value={normalizeSetStatus(s.status)}
                                onChange={(e) =>
                                  updateDraftSet(exIdx, activeVariantIndex, setIdx, 'status', e.target.value)
                                }
                              >
                                {SET_STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
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
                    )}

                    {!isCustomDraftBlock(exBlock) ? (
                      <div className={styles.exerciseVolume}>
                        Объём: {formatWorkoutVolume(calcExerciseVolumeFromDraftBlock(exBlock))} кг
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <div className={styles.workoutVolumeTotal}>
                Итого: {formatWorkoutVolume(draftWorkoutVolume)} кг
              </div>

              <div className={styles.createFooter}>
                <button
                  type="button"
                  className={styles.addExerciseBtn}
                  onClick={() => {
                    setDraftExercises((prev) => [
                      ...prev,
                      createEmptyBlock(prev.length + 1),
                    ]);
                    setOpenExerciseDropdown(null);
                  }}
                >
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
            </div>
          ) : (
            <div className={styles.workoutSummary}>
              <div className={styles.workoutTitleRow}>
                <div className={styles.workoutTitle}>{activeWorkout?.title || 'Тренировка'}</div>
                {activeWorkout?.id ? (
                  <select
                    className={styles.workoutStatusSelect}
                    value={normalizeWorkoutStatus(activeWorkout?.workout_status)}
                    disabled={workoutStatusSaving}
                    onChange={(e) => updateWorkoutStatus(e.target.value)}
                    aria-label="Статус тренировки"
                  >
                    {WORKOUT_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              {activeWorkout?.notes ? (
                <div className={styles.workoutNotes}>{activeWorkout.notes}</div>
              ) : null}

              {activeWorkout?.id && canEditPlans ? (
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => navigate(`/workouts/${activeWorkout.id}/calendar-edit`)}
                >
                  Редактировать
                </button>
              ) : null}

              {loadingWorkoutData ? (
                <div className={styles.muted}>Загрузка упражнений…</div>
              ) : workoutDataError ? (
                <div className={styles.error}>{workoutDataError}</div>
              ) : viewBlocks.length === 0 ? (
                <div className={styles.muted}>В этой тренировке пока нет упражнений</div>
              ) : (
                <div className={styles.exercises}>
                  {viewBlocks.map((block, idx) => {
                    const we = block.we;
                    const sortedIndices = getSortedVariantIndices(block.variants);
                    const activeVariantIndex = resolveActiveVariantIndex(
                      block.variants,
                      activeVariantByWeId[we.id] ?? we.active_variant_index ?? MAIN_VARIANT_INDEX
                    );
                    const carouselPos = sortedIndices.indexOf(activeVariantIndex);
                    const activeVariant = getVariantRecordByIndex(block.variants, activeVariantIndex);
                    const exerciseName = getVariantExerciseName(activeVariant, we);
                    const sets = activeVariant
                      ? block.setsByVariantId[activeVariant.id] || []
                      : [];
                    const isCustomView = isCustomApiVariant(activeVariant);
                    const customColumns = isCustomView
                      ? getColumnsFromCustomExercise(activeVariant?.expand?.custom_exercise)
                      : [];
                    const customViewSets = sets.map((s) => ({
                      id: s.id,
                      set_number: s.set_number,
                      values: s.values && typeof s.values === 'object' ? s.values : {},
                    }));

                    return (
                      <div key={we.id} className={styles.exerciseBlock}>
                        {sortedIndices.length > 0 && (
                          <ExerciseVariantCarousel
                            variantIndex={activeVariantIndex}
                            variantCount={sortedIndices.length}
                            positionIndex={carouselPos >= 0 ? carouselPos : 0}
                            mode="view"
                            onPrev={() => {
                              if (carouselPos > 0) {
                                changeViewVariant(we.id, sortedIndices[carouselPos - 1]);
                              }
                            }}
                            onNext={() => {
                              if (carouselPos < sortedIndices.length - 1) {
                                changeViewVariant(we.id, sortedIndices[carouselPos + 1]);
                              }
                            }}
                          />
                        )}

                        <div className={styles.exerciseRow}>
                          <div className={styles.exerciseIndex}>{idx + 1}</div>
                          <div className={styles.exerciseName} title={exerciseName}>
                            {exerciseName || '(без названия)'}
                          </div>
                        </div>

                        {isCustomView ? (
                          <DynamicSetTable
                            columns={customColumns}
                            sets={customViewSets}
                            mode="view"
                          />
                        ) : (
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
                                const statusValue = normalizeSetStatus(s.status);

                                return (
                                  <div key={s.id} className={styles.setRow}>
                                    <div className={styles.cell}>{s.weight}</div>
                                    <div className={styles.cell}>{s.reps}</div>
                                    <div className={styles.cell}>
                                      <select
                                        className={styles.statusSelect}
                                        value={statusValue}
                                        disabled={!s.id}
                                        onChange={(e) => {
                                          updateSetStatus(activeVariant.id, s.id, e.target.value);
                                        }}
                                      >
                                        {SET_STATUS_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}

                        {!isCustomBlock(block) ? (
                          <div className={styles.exerciseVolume}>
                            Объём: {formatWorkoutVolume(calcExerciseVolumeFromBlock(block))} кг
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {!loadingWorkoutData && !workoutDataError && viewBlocks.length > 0 ? (
                <div className={styles.workoutVolumeTotal}>
                  Итого: {formatWorkoutVolume(workoutVolume)} кг
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CalendarWorkoutForm;

