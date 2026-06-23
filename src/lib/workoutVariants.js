import pb from './pocketbase';
import {
  createEmptyValues,
  createEmptySetRowForColumns,
  getColumnsFromCustomExercise,
  isCustomApiVariant,
} from './exerciseSetSchema';
import { normalizeSetStatus, statusToPocketBase } from './setStatus';
import { normalizeWorkoutStatus, workoutStatusToPocketBase } from './setStatus';
import {
  MAIN_VARIANT_INDEX,
  EMPTY_SET_ROW,
  createEmptyVariantSlot,
  getVariantExerciseName,
  isVariantFilled,
} from './workoutVariantConstants';

function draftSetFromApi(setRecord, isCustom, columns) {
  if (isCustom) {
    const base = createEmptyValues(columns);
    const raw = setRecord.values && typeof setRecord.values === 'object' ? setRecord.values : {};
    return {
      set_number: setRecord.set_number,
      values: { ...base, ...raw },
    };
  }

  return {
    set_number: setRecord.set_number,
    weight: String(setRecord.weight ?? ''),
    reps: String(setRecord.reps ?? ''),
    status: normalizeSetStatus(setRecord.status),
  };
}

function legacyVariantId(weId) {
  return `legacy-${weId}`;
}

function buildSyntheticLegacyVariant(we) {
  return {
    id: legacyVariantId(we.id),
    workout_exercise: we.id,
    exercise: we.exercise,
    variant_index: MAIN_VARIANT_INDEX,
    expand: {
      exercise: we.expand?.exercise || null,
    },
  };
}

async function loadLegacySetsByWeId(weIds) {
  if (weIds.length === 0) return {};

  try {
    const filter = weIds.map((id) => `workout_exercise = "${id}"`).join(' || ');
    const sets = await pb.collection('sets').getFullList({
      filter,
      sort: 'set_number',
      requestKey: null,
    });

    const grouped = {};
    for (const s of sets) {
      const key = s.workout_exercise;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    }
    return grouped;
  } catch {
    return {};
  }
}

/**
 * Загружает блоки тренировки с вариантами и подходами.
 * @returns {{ blocks: Array<{ we, variants, setsByVariantId }> }}
 */
export async function loadWorkoutBlocks(workoutId) {
  const weList = await pb.collection('workout_exercises').getFullList({
    filter: `workout = "${workoutId}"`,
    sort: 'order_index',
    expand: 'exercise',
    requestKey: null,
  });

  if (weList.length === 0) {
    return { blocks: [] };
  }

  const weIds = weList.map((x) => x.id);
  const weFilter = weIds.map((id) => `workout_exercise = "${id}"`).join(' || ');

  let variants = [];
  try {
    variants = await pb.collection('workout_exercise_variants').getFullList({
      filter: weFilter,
      expand: 'exercise,custom_exercise',
      sort: 'variant_index',
      requestKey: null,
    });
  } catch (e) {
    console.error('Ошибка загрузки вариантов упражнений:', e);
    throw e;
  }

  const variantsByWeId = {};
  for (const v of variants) {
    const weId = v.workout_exercise;
    if (!variantsByWeId[weId]) variantsByWeId[weId] = [];
    variantsByWeId[weId].push(v);
  }

  const blocksWithoutVariants = weList.filter(
    (we) => !variantsByWeId[we.id]?.length && we.exercise
  );
  const legacySetsByWeId = await loadLegacySetsByWeId(blocksWithoutVariants.map((we) => we.id));

  const variantIds = variants.map((v) => v.id);
  const setsByVariantId = {};

  if (variantIds.length > 0) {
    const variantFilter = variantIds.map((id) => `workout_exercise_variant = "${id}"`).join(' || ');
    const sets = await pb.collection('sets').getFullList({
      filter: variantFilter,
      sort: 'set_number',
      requestKey: null,
    });

    for (const s of sets) {
      const key = s.workout_exercise_variant;
      if (!setsByVariantId[key]) setsByVariantId[key] = [];
      setsByVariantId[key].push(s);
    }
  }

  const blocks = weList.map((we) => {
    let blockVariants = variantsByWeId[we.id] || [];
    const blockSetsByVariantId = {};

    if (blockVariants.length === 0 && we.exercise) {
      const synthetic = buildSyntheticLegacyVariant(we);
      blockVariants = [synthetic];
      const legacySets = legacySetsByWeId[we.id] || [];
      if (legacySets.length > 0) {
        blockSetsByVariantId[synthetic.id] = legacySets;
      }
    } else {
      for (const v of blockVariants) {
        if (setsByVariantId[v.id]) {
          blockSetsByVariantId[v.id] = setsByVariantId[v.id];
        }
      }
    }

    return {
      we,
      variants: blockVariants,
      setsByVariantId: blockSetsByVariantId,
    };
  });

  return { blocks };
}

export async function setActiveVariantIndex(weId, variantIndex) {
  return pb.collection('workout_exercises').update(
    weId,
    { active_variant_index: variantIndex },
    { requestKey: null }
  );
}

/**
 * Имя упражнения активного варианта (последний выбранный в карусели).
 */
export function getActiveVariantExerciseName(we, variants) {
  const activeIndex = we.active_variant_index ?? MAIN_VARIANT_INDEX;
  const activeVariant =
    variants.find((v) => v.variant_index === activeIndex) ||
    variants.find((v) => v.variant_index === MAIN_VARIANT_INDEX) ||
    variants[0];

  return getVariantExerciseName(activeVariant, we);
}

/**
 * Имя упражнения слота «Основное» (variant_index = 0) для календаря / превью.
 */
export function getMainVariantExerciseName(we, variants) {
  const mainVariant =
    variants.find((v) => v.variant_index === MAIN_VARIANT_INDEX) || variants[0];
  return getVariantExerciseName(mainVariant, we);
}

/**
 * Преобразует API-данные блока в draft для create/edit форм.
 */
export function normalizeBlockDraftFromApi(we, variants, setsByVariantId) {
  const activeVariantIndex = we.active_variant_index ?? MAIN_VARIANT_INDEX;
  const variantsMap = {};

  for (const v of variants) {
    const isCustom = isCustomApiVariant(v);
    const columns = isCustom ? getColumnsFromCustomExercise(v.expand?.custom_exercise) : null;
    const sets = setsByVariantId[v.id] || [];
    variantsMap[v.variant_index] = {
      variantIndex: v.variant_index,
      variantId: v.id,
      exerciseId: v.exercise || null,
      customExerciseId: v.custom_exercise || null,
      exerciseKind: isCustom ? 'custom' : 'classic',
      exerciseName: isCustom
        ? v.expand?.custom_exercise?.custom_exercise_name || ''
        : v.expand?.exercise?.exercise_name || '',
      setColumns: columns,
      sets:
        sets.length > 0
          ? sets.map((s) => draftSetFromApi(s, isCustom, columns))
          : isCustom
            ? [createEmptySetRowForColumns(columns)]
            : [{ ...EMPTY_SET_ROW }],
    };
  }

  if (!variantsMap[MAIN_VARIANT_INDEX]) {
    variantsMap[MAIN_VARIANT_INDEX] = createEmptyVariantSlot(MAIN_VARIANT_INDEX);
  }

  return {
    workoutExerciseId: we.id,
    orderIndex: we.order_index,
    activeVariantIndex,
    variants: variantsMap,
  };
}

/**
 * Создаёт workout_exercises, варианты и подходы из draft-блока.
 * Сохраняет только заполненные слоты (exerciseId != null).
 */
export async function saveBlockVariantsAndSets({ workoutId, blockDraft, orderIndex }) {
  const activeVariantIndex = blockDraft.activeVariantIndex ?? MAIN_VARIANT_INDEX;
  const mainVariant = blockDraft.variants?.[MAIN_VARIANT_INDEX];

  const wePayload = {
    workout: workoutId,
    order_index: orderIndex,
    active_variant_index: activeVariantIndex,
  };

  if (mainVariant?.exerciseKind !== 'custom' && mainVariant?.exerciseId) {
    wePayload.exercise = mainVariant.exerciseId;
  }

  const we = await pb.collection('workout_exercises').create(wePayload, { requestKey: null });

  const filledVariants = Object.values(blockDraft.variants || {}).filter(isVariantFilled);

  await Promise.all(
    filledVariants.map(async (variantDraft) => {
      const isCustom = variantDraft.exerciseKind === 'custom' || variantDraft.customExerciseId;
      const variantPayload = {
        workout_exercise: we.id,
        variant_index: variantDraft.variantIndex,
      };

      if (isCustom) {
        variantPayload.custom_exercise = variantDraft.customExerciseId;
      } else {
        variantPayload.exercise = variantDraft.exerciseId;
      }

      const variantRecord = await pb.collection('workout_exercise_variants').create(
        variantPayload,
        { requestKey: null }
      );

      const setsToCreate =
        variantDraft.sets && variantDraft.sets.length
          ? variantDraft.sets
          : isCustom
            ? [createEmptySetRowForColumns(variantDraft.setColumns)]
            : [{ ...EMPTY_SET_ROW }];

      await Promise.all(
        setsToCreate.map((s, i) => {
          if (isCustom) {
            return pb.collection('sets').create(
              {
                workout_exercise_variant: variantRecord.id,
                set_number: i + 1,
                values: s.values || {},
              },
              { requestKey: null }
            );
          }

          return pb.collection('sets').create(
            {
              workout_exercise_variant: variantRecord.id,
              set_number: i + 1,
              weight: Number(s.weight) || 0,
              reps: Number(s.reps) || 0,
              status: statusToPocketBase(s.status),
            },
            { requestKey: null }
          );
        })
      );
    })
  );

  return we;
}

/**
 * Полная пересинхронизация блоков тренировки из draft (edit).
 * Удаляет старые workout_exercises (cascade → variants, sets) и создаёт заново.
 */
export async function syncWorkoutBlocksFromDraft({ workoutId, draftBlocks }) {
  const currentWe = await pb.collection('workout_exercises').getFullList({
    filter: `workout = "${workoutId}"`,
    requestKey: null,
  });

  if (currentWe.length > 0) {
    await Promise.all(
      currentWe.map((we) => pb.collection('workout_exercises').delete(we.id, { requestKey: null }))
    );
  }

  await Promise.all(
    draftBlocks.map((block, idx) =>
      saveBlockVariantsAndSets({
        workoutId,
        blockDraft: block,
        orderIndex: idx + 1,
      })
    )
  );
}

export function sanitizeBlockDraftForCopy(blockDraft) {
  const nextVariants = {};
  for (const [k, v] of Object.entries(blockDraft.variants || {})) {
    const variantIndex = Number(k);
    const isCustom = v?.exerciseKind === 'custom' || Boolean(v?.customExerciseId);
    nextVariants[variantIndex] = {
      variantIndex,
      exerciseId: v?.exerciseId ?? null,
      customExerciseId: v?.customExerciseId ?? null,
      exerciseKind: v?.exerciseKind || (isCustom ? 'custom' : 'classic'),
      exerciseName: v?.exerciseName || '',
      setColumns: v?.setColumns ? [...v.setColumns] : null,
      sets: (v?.sets || []).map((s, i) => {
        if (isCustom) {
          return {
            set_number: Number(s?.set_number) || i + 1,
            values: { ...(s?.values || {}) },
          };
        }
        return {
          set_number: Number(s?.set_number) || i + 1,
          weight: String(s?.weight ?? ''),
          reps: String(s?.reps ?? ''),
          status: normalizeSetStatus(s?.status),
        };
      }),
    };
  }

  return {
    workoutExerciseId: null,
    orderIndex: Number(blockDraft.orderIndex) || 1,
    activeVariantIndex: blockDraft.activeVariantIndex ?? MAIN_VARIANT_INDEX,
    variants: nextVariants,
  };
}

export async function loadWorkoutDraftFromApi(workoutId) {
  const workout = await pb.collection('workouts').getOne(workoutId, { requestKey: null });
  const { blocks } = await loadWorkoutBlocks(workoutId);
  const exercises = blocks.map((block) =>
    sanitizeBlockDraftForCopy(
      normalizeBlockDraftFromApi(block.we, block.variants, block.setsByVariantId)
    )
  );

  return {
    title: workout?.title || '',
    notes: workout?.notes || '',
    workoutStatus: normalizeWorkoutStatus(workout?.workout_status),
    exercises,
  };
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

export async function pasteWorkoutDraftToDay({ userId, dayKey, draft, existingWorkoutIds }) {
  if (!userId) throw new Error('Missing userId');
  if (!dayKey) throw new Error('Missing dayKey');
  if (!draft) throw new Error('Missing draft');

  const idsToDelete = Array.isArray(existingWorkoutIds)
    ? existingWorkoutIds.filter(Boolean)
    : existingWorkoutIds
      ? [existingWorkoutIds]
      : [];

  if (idsToDelete.length > 0) {
    await Promise.all(
      idsToDelete.map((id) => pb.collection('workouts').delete(id, { requestKey: null }))
    );
  }

  const workout = await pb.collection('workouts').create(
    {
      user: userId,
      date: dayKey,
      title: draft.title || '',
      notes: draft.notes || '',
      workout_status: workoutStatusToPocketBase(draft.workoutStatus),
    },
    { requestKey: null }
  );

  const blocks = Array.isArray(draft.exercises) ? draft.exercises : [];
  await Promise.all(
    blocks.map((block, idx) =>
      saveBlockVariantsAndSets({
        workoutId: workout.id,
        blockDraft: block,
        orderIndex: idx + 1,
      })
    )
  );

  return workout?.id || null;
}
