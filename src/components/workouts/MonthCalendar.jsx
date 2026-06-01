import styles from './MonthCalendar.module.css';

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function MonthCalendar({ grid, onDayClick, exerciseNamesByDay, maxLines = 3 }) {
  const renderCellContent = (cell) => (
    <>
      <span className={styles.dayNum}>{cell.date.getDate()}</span>

      {Array.isArray(exerciseNamesByDay?.[cell.dayKey]) &&
        exerciseNamesByDay[cell.dayKey].length > 0 && (
          <div className={styles.exerciseMiniList}>
            {exerciseNamesByDay[cell.dayKey].slice(0, maxLines).map((name, idx) => (
              <div key={`${cell.dayKey}-${idx}`} className={styles.exerciseMiniItem}>
                {name}
              </div>
            ))}
            {exerciseNamesByDay[cell.dayKey].length > maxLines && (
              <div className={styles.exerciseMiniMore}>
                +{exerciseNamesByDay[cell.dayKey].length - maxLines}
              </div>
            )}
          </div>
        )}
    </>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.weekdays}>
        {WEEKDAYS_RU.map((d) => (
          <div key={d} className={styles.weekday}>
            {d}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {grid.map((cell) => {
          const cellClassName = [
            styles.cell,
            cell.inMonth ? styles.cellInMonth : styles.cellOutMonth,
            cell.isToday ? styles.cellToday : '',
          ]
            .filter(Boolean)
            .join(' ');

          if (cell.inMonth) {
            return (
              <button
                key={cell.dayKey}
                type="button"
                className={cellClassName}
                onClick={() => onDayClick?.(cell.dayKey)}
                aria-label={`Тренировка ${cell.dayKey}`}
              >
                {renderCellContent(cell)}
              </button>
            );
          }

          return (
            <div key={cell.dayKey} className={cellClassName}>
              {renderCellContent(cell)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MonthCalendar;
