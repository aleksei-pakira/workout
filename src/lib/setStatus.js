/** Канонические значения status в PocketBase, draft и UI */
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

/** PocketBase multi-select: в API приходит массив, напр. ["done"] */
export function coerceStatusRaw(raw) {
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw ?? '';
}

/**
 * Нормализация для UI/draft: planned | done | failed | skipped.
 * Legacy: plan, completed, fail, skip и т.п.
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

/** Поле status для create/update в PocketBase (multi-select → массив) */
export function statusToPocketBase(value) {
  return [normalizeSetStatus(value)];
}
