export const MAX_VARIANT_INDEX = 9;
export const MAIN_VARIANT_INDEX = 0;

export const EMPTY_SET_ROW = {
  set_number: 1,
  weight: '',
  reps: '',
  status: 'planned',
};

export function getVariantLabel(variantIndex) {
  if (variantIndex === MAIN_VARIANT_INDEX) return 'Основное';
  return `Вариант ${variantIndex}`;
}

export function createEmptyVariantSlot(variantIndex) {
  return {
    variantIndex,
    exerciseId: null,
    exerciseName: '',
    sets: [{ ...EMPTY_SET_ROW }],
  };
}

export function createEmptyBlock(orderIndex = 1) {
  return {
    workoutExerciseId: null,
    orderIndex,
    activeVariantIndex: MAIN_VARIANT_INDEX,
    variants: {
      [MAIN_VARIANT_INDEX]: createEmptyVariantSlot(MAIN_VARIANT_INDEX),
    },
  };
}

/** Сколько слотов доступно для листания в create/edit (0..N включительно). */
export function getEditCarouselVariantCount(variants) {
  const keys = Object.keys(variants || {}).map(Number);
  const highestDefined = keys.length > 0 ? Math.max(...keys) : MAIN_VARIANT_INDEX;
  const maxNavigableIndex = Math.min(MAX_VARIANT_INDEX, highestDefined + 1);
  return maxNavigableIndex + 1;
}

/** Индексы существующих вариантов (отсортированы). */
export function getSortedVariantIndices(variants) {
  if (!variants?.length) return [MAIN_VARIANT_INDEX];
  return [...new Set(variants.map((v) => v.variant_index))].sort((a, b) => a - b);
}

/** Активный variant_index с fallback на первый существующий слот. */
export function resolveActiveVariantIndex(variants, activeVariantIndex) {
  const sorted = getSortedVariantIndices(variants);
  if (sorted.includes(activeVariantIndex)) return activeVariantIndex;
  return sorted[0];
}

export function getVariantRecordByIndex(variants, variantIndex) {
  return variants?.find((v) => v.variant_index === variantIndex) || null;
}

export function getVariantExerciseName(variant, we) {
  return (
    variant?.expand?.exercise?.exercise_name ||
    we?.expand?.exercise?.exercise_name ||
    we?.custom_name ||
    we?.exercise_name ||
    ''
  );
}
