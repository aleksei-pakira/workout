import { isCustomBlock, isCustomDraftBlock } from './exerciseSetSchema';
import { normalizeSetStatus, SET_STATUS } from './setStatus';

function isDoneSet(set) {
  return normalizeSetStatus(set?.status) === SET_STATUS.DONE;
}

export function calcSetVolume(set) {
  if (!isDoneSet(set)) return 0;
  const weight = Number(set?.weight) || 0;
  const reps = Number(set?.reps) || 0;
  return weight * reps;
}

/** block из loadWorkoutBlocks: { setsByVariantId } */
export function calcExerciseVolumeFromBlock(block) {
  if (isCustomBlock(block)) return 0;
  let total = 0;
  for (const sets of Object.values(block.setsByVariantId || {})) {
    for (const s of sets) total += calcSetVolume(s);
  }
  return total;
}

/** block из draftExercises: { variants } */
export function calcExerciseVolumeFromDraftBlock(block) {
  if (isCustomDraftBlock(block)) return 0;
  let total = 0;
  for (const variant of Object.values(block.variants || {})) {
    for (const s of variant.sets || []) total += calcSetVolume(s);
  }
  return total;
}

export function calcWorkoutVolumeFromBlocks(blocks) {
  return (blocks || []).reduce((sum, block) => sum + calcExerciseVolumeFromBlock(block), 0);
}

export function calcWorkoutVolumeFromDraft(draftExercises) {
  return (draftExercises || []).reduce(
    (sum, block) => sum + calcExerciseVolumeFromDraftBlock(block),
    0
  );
}

export function formatWorkoutVolume(total) {
  if (!Number.isFinite(total) || total <= 0) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(total);
}

export function aggregateVolumeByDayKey(sets, variantIdToDayKey, variantIdToIsCustom = {}) {
  const volumeByDay = {};
  for (const s of sets || []) {
    const variantId = s.workout_exercise_variant;
    if (variantIdToIsCustom[variantId]) continue;
    const dayKey = variantIdToDayKey[variantId];
    if (!dayKey) continue;
    volumeByDay[dayKey] = (volumeByDay[dayKey] || 0) + calcSetVolume(s);
  }
  return volumeByDay;
}
