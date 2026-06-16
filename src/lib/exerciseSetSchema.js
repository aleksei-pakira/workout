export const MAX_SET_COLUMNS = 5;
export const COLUMN_TYPES = ['text', 'number', 'list'];

function slugKey(label, index) {
  const base = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return base || `col_${index + 1}`;
}

export function normalizeSetColumns(raw) {
  if (!Array.isArray(raw)) return [];
  const usedKeys = new Set();
  const result = [];

  for (let i = 0; i < raw.length && result.length < MAX_SET_COLUMNS; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;

    const label = String(item.label || '').trim();
    if (!label) continue;

    const type = COLUMN_TYPES.includes(item.type) ? item.type : 'text';
    let key = String(item.key || slugKey(label, i)).trim() || slugKey(label, i);
    let suffix = 1;
    const baseKey = key;
    while (usedKeys.has(key)) {
      suffix += 1;
      key = `${baseKey}_${suffix}`;
    }
    usedKeys.add(key);

    const col = { key, label, type };
    if (type === 'list') {
      const options = Array.isArray(item.options)
        ? item.options.map((o) => String(o).trim()).filter(Boolean)
        : String(item.options || '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean);
      if (options.length < 2) continue;
      col.options = options;
    }
    result.push(col);
  }

  return result;
}

export function createEmptyValues(columns) {
  const values = {};
  for (const col of columns || []) {
    values[col.key] = '';
  }
  return values;
}

export function createEmptySetRowForColumns(columns) {
  return {
    set_number: 1,
    values: createEmptyValues(columns),
  };
}

export function isCustomVariant(variant) {
  return variant?.exerciseKind === 'custom' || Boolean(variant?.customExerciseId);
}

export function isCustomApiVariant(variant) {
  return Boolean(variant?.custom_exercise);
}

export function isCustomDraftBlock(block) {
  for (const v of Object.values(block?.variants || {})) {
    if (isCustomVariant(v)) return true;
  }
  return false;
}

export function isCustomBlock(block) {
  return (block?.variants || []).some((v) => isCustomApiVariant(v));
}

export function getColumnsFromCustomExercise(record) {
  return normalizeSetColumns(record?.set_columns);
}

export function getExercisePickerLabel(item) {
  if (!item) return '';
  if (item.kind === 'custom') return item.custom_exercise_name || '';
  return item.exercise_name || '';
}

export function parseListOptionsInput(value) {
  return String(value || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function columnsToDraftRows(columns) {
  const normalized = normalizeSetColumns(columns);
  if (!normalized.length) {
    return [{ label: '', type: 'text', options: '' }];
  }
  return normalized.map((col) => ({
    label: col.label,
    type: col.type,
    options: col.type === 'list' ? (col.options || []).join(', ') : '',
  }));
}

export function draftRowsToColumns(rows) {
  return normalizeSetColumns(
    (rows || [])
      .map((row, index) => {
        const label = String(row?.label || '').trim();
        if (!label) return null;
        const type = COLUMN_TYPES.includes(row?.type) ? row.type : 'text';
        if (type === 'list') {
          return {
            key: slugKey(label, index),
            label,
            type,
            options: parseListOptionsInput(row?.options),
          };
        }
        return { key: slugKey(label, index), label, type };
      })
      .filter(Boolean)
  );
}
