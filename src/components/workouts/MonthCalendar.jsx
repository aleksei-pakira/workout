import styles from './MonthCalendar.module.css';

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function MonthCalendar({ grid, onDayClick, exerciseNamesByDay, maxLines = 3 }) {
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
        {grid.map((cell) => (
          <div
            key={cell.dayKey}
            className={[
              styles.cell,
              cell.inMonth ? styles.cellInMonth : styles.cellOutMonth,
              cell.isToday ? styles.cellToday : '',
            ].join(' ')}
          >
            <button
              type="button"
              className={styles.dayNum}
              onClick={() => onDayClick?.(cell.dayKey)}
            >
              {cell.date.getDate()}
            </button>

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
          </div>
        ))}
      </div>
    </div>
  );
}

export default MonthCalendar;

