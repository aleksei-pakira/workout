import styles from './MonthCalendar.module.css';

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getWorkoutStatusCellClass(status, styleModule) {
  switch (status) {
    case 'done':
      return styleModule.cellStatusDone;
    case 'failed':
      return styleModule.cellStatusFailed;
    case 'skipped':
      return styleModule.cellStatusSkipped;
    case 'planned':
      return styleModule.cellStatusPlanned;
    default:
      return '';
  }
}

function MonthCalendar({
  grid,
  onDayClick,
  exerciseNamesByDay,
  workoutStatusByDay,
  workoutIdByDay,
  pasteMode,
  selectedDayKeys,
  onToggleDay,
  onCopyDay,
  maxLines = 3,
}) {
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
          const workoutStatus =
            cell.inMonth && workoutStatusByDay && cell.dayKey in workoutStatusByDay
              ? workoutStatusByDay[cell.dayKey]
              : null;
          const statusClass = workoutStatus ? getWorkoutStatusCellClass(workoutStatus, styles) : '';
          const isSelected = Boolean(cell.inMonth && selectedDayKeys?.has?.(cell.dayKey));
          const hasWorkout = Boolean(cell.inMonth && workoutIdByDay?.[cell.dayKey]);

          const cellClassName = [
            styles.cell,
            cell.inMonth ? styles.cellInMonth : styles.cellOutMonth,
            statusClass,
            isSelected ? styles.cellSelected : '',
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
                onClick={() => {
                  if (pasteMode) {
                    onToggleDay?.(cell.dayKey);
                    return;
                  }
                  onDayClick?.(cell.dayKey);
                }}
                aria-label={`Тренировка ${cell.dayKey}`}
                data-workout-status={workoutStatus || undefined}
              >
                {hasWorkout ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className={styles.copyBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyDay?.(cell.dayKey);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onCopyDay?.(cell.dayKey);
                      }
                    }}
                    aria-label="Copy workout"
                    title="Copy workout"
                  >
                    Copy
                  </span>
                ) : null}
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
