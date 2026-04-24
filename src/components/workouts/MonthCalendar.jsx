import styles from './MonthCalendar.module.css';

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function MonthCalendar({ grid }) {
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
            <div className={styles.dayNum}>{cell.date.getDate()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MonthCalendar;

