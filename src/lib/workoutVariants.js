import pb from './pocketbase';
import {
  MAIN_VARIANT_INDEX,
  EMPTY_SET_ROW,
  createEmptyVariantSlot,
  getVariantExerciseName,
} from './workoutVariantConstants';

function normalizeStatus(raw) {
  if (!raw) return 'planned';
  if (raw === 'plan') return 'planned';
  if (raw === 'done') return 'completed';
  if (raw === 'fail') return 'failed';
  if (raw === 'planned' || raw === 'completed' || raw === 'failed' || raw === 'skipped') return raw;
  return 'planned';
}

function draftSetFromApi(setRecord) {
  return {
    set_number: setRecord.set_number,
    weight: String(setRecord.weight ?? ''),
    reps: String(setRecord.reps ?? ''),
    status: normalizeStatus(setRecord.status),
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
      expand: 'exercise',
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
 * Имя упражнения активного варианта для календаря / списков.
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
 * Преобразует API-данные блока в draft для create/edit форм.
 */
export function normalizeBlockDraftFromApi(we, variants, setsByVariantId) {
  const activeVariantIndex = we.active_variant_index ?? MAIN_VARIANT_INDEX;
  const variantsMap = {};

  for (const v of variants) {
    const sets = setsByVariantId[v.id] || [];
    variantsMap[v.variant_index] = {
      variantIndex: v.variant_index,
      variantId: v.id,
      exerciseId: v.exercise,
      exerciseName: v.expand?.exercise?.exercise_name || '',
      sets:
        sets.length > 0
          ? sets.map(draftSetFromApi)
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

  if (mainVariant?.exerciseId) {
    wePayload.exercise = mainVariant.exerciseId;
  }

  const we = await pb.collection('workout_exercises').create(wePayload, { requestKey: null });

  const filledVariants = Object.values(blockDraft.variants || {}).filter((v) => v.exerciseId);

  await Promise.all(
    filledVariants.map(async (variantDraft) => {
      const variantRecord = await pb.collection('workout_exercise_variants').create(
        {
          workout_exercise: we.id,
          exercise: variantDraft.exerciseId,
          variant_index: variantDraft.variantIndex,
        },
        { requestKey: null }
      );

      const setsToCreate =
        variantDraft.sets && variantDraft.sets.length
          ? variantDraft.sets
          : [{ ...EMPTY_SET_ROW }];

      await Promise.all(
        setsToCreate.map((s, i) =>
          pb.collection('sets').create(
            {
              workout_exercise_variant: variantRecord.id,
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
