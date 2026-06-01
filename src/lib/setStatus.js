/**
 * Общая номенклатура статусов для sets.status и workouts.workout_status.
 * Поля в PocketBase независимы; default в PB для workout_status нет — fallback на фронте.
 */
export const SET_STATUS = {
  PLANNED: 'planned',
  DONE: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

export const DEFAULT_SET_STATUS = SET_STATUS.PLANNED;

export const SET_STATUS_OPTIONS = [
  { value: SET_STATUS.PLANNED, label: 'planned' },
  { value: SET_STATUS.DONE, label: 'done' },
  { value: SET_STATUS.FAILED, label: 'failed' },
  { value: SET_STATUS.SKIPPED, label: 'skipped' },
];

export const DEFAULT_WORKOUT_STATUS = DEFAULT_SET_STATUS;
export const WORKOUT_STATUS_OPTIONS = SET_STATUS_OPTIONS;

/** PocketBase multi-select: в API приходит массив, напр. ["done"] */
export function coerceStatusRaw(raw) {
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw ?? '';
}

/**
 * Нормализация для UI/draft: planned | done | failed | skipped.
 * null / undefined / '' / [] → planned. Legacy: plan, completed, fail, skip.
 */
export function normalizeSetStatus(raw) {
  const v = String(coerceStatusRaw(raw)).toLowerCase().trim();
  if (!v) return DEFAULT_SET_STATUS;

  switch (v) {
    case 'plan':
    case 'planned':
      return SET_STATUS.PLANNED;
    case 'done':
    case 'completed':
      return SET_STATUS.DONE;
    case 'fail':
    case 'failed':
      return SET_STATUS.FAILED;
    case 'skip':
    case 'skipped':
      return SET_STATUS.SKIPPED;
    default:
      return DEFAULT_SET_STATUS;
  }
}

export const normalizeWorkoutStatus = normalizeSetStatus;

/** sets.status или workouts.workout_status → массив для PB multi-select */
export function statusToPocketBase(value) {
  return [normalizeSetStatus(value)];
}

export const workoutStatusToPocketBase = statusToPocketBase;

export function getWorkoutStatusForDisplay(workout) {
  return normalizeWorkoutStatus(workout?.workout_status);
}
