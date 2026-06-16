import styles from './DynamicSetTable.module.css';

function gridStyle(columnCount, withActions) {
  const cols = `repeat(${columnCount}, minmax(0, 1fr))`;
  return { gridTemplateColumns: withActions ? `${cols} 28px` : cols };
}

export default function DynamicSetTable({
  columns,
  sets,
  mode = 'edit',
  onChangeValue,
  onAddSet,
  onRemoveSet,
}) {
  if (!columns?.length) return null;

  const isEdit = mode === 'edit';
  const rowStyle = gridStyle(columns.length, isEdit);
  const headerStyle = gridStyle(columns.length, false);

  return (
    <div className={styles.setsTable}>
      <div className={styles.setsHeader} style={headerStyle}>
        {columns.map((col) => (
          <div key={col.key} className={styles.hCell} title={col.label}>
            {col.label}
          </div>
        ))}
      </div>

      {(sets || []).length === 0 ? (
        <div className={styles.noSets}>Пока нет подходов</div>
      ) : (
        sets.map((s, setIdx) => (
          <div
            key={s.id || s.set_number || setIdx}
            className={isEdit ? styles.setRowCreate : styles.setRow}
            style={rowStyle}
          >
            {columns.map((col) => {
              const value = s.values?.[col.key] ?? '';

              if (!isEdit) {
                return (
                  <div key={col.key} className={styles.viewCell} title={String(value)}>
                    {String(value)}
                  </div>
                );
              }

              if (col.type === 'list') {
                return (
                  <div key={col.key} className={styles.cell}>
                    <select
                      className={styles.statusSelect}
                      value={value}
                      onChange={(e) => onChangeValue?.(setIdx, col.key, e.target.value)}
                    >
                      <option value="">—</option>
                      {(col.options || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              return (
                <div key={col.key} className={styles.cell}>
                  <input
                    type={col.type === 'number' ? 'number' : 'text'}
                    className={styles.cellInput}
                    value={value}
                    onChange={(e) => onChangeValue?.(setIdx, col.key, e.target.value)}
                    inputMode={col.type === 'number' ? 'decimal' : 'text'}
                  />
                </div>
              );
            })}
            {isEdit ? (
              <button
                type="button"
                className={styles.removeSetBtn}
                onClick={() => onRemoveSet?.(setIdx)}
                disabled={(sets || []).length <= 1}
                aria-label="Remove set"
              >
                ×
              </button>
            ) : null}
          </div>
        ))
      )}

      {isEdit ? (
        <button type="button" className={styles.addSetBtn} onClick={onAddSet}>
          + Добавить подход
        </button>
      ) : null}
    </div>
  );
}
