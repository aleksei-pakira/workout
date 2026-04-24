import styles from './WorkoutCard.module.css';

function WorkoutCard({ workout, classes, onOpen }) {
  return (
    <div
      className={classes.workoutItem}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
    >
      <div className={classes.workoutItemMain}>
        <div className={classes.workoutItemTitle}>{workout.title || 'Тренировка'}</div>

        <div className={classes.workoutItemSub}>
          📅 {new Date(workout.date).toLocaleDateString('ru-RU')}
          {workout.notes ? ` • 📝 ${workout.notes}` : ''}
        </div>

        {(workout.exercises_count != null || workout.total_sets != null) && (
          <div className={classes.workoutItemMetaRow}>
            {workout.exercises_count != null && (
              <span className={classes.metaChip}>🏋️ {workout.exercises_count}</span>
            )}
            {workout.total_sets != null && <span className={classes.metaChip}>⚡ {workout.total_sets}</span>}
          </div>
        )}
      </div>

      <div className={classes.workoutItemActions}>
        <button
          type="button"
          className={classes.openBtn}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          Открыть
        </button>
      </div>

      <span className={styles.srOnly}>Workout card</span>
    </div>
  );
}

export default WorkoutCard;

