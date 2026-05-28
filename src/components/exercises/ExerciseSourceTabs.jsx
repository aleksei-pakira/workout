import styles from './ExerciseSourceTabs.module.css';

export default function ExerciseSourceTabs({
  value,
  onChange,
  className = '',
  labels = { mine: 'Мои упражнения', public: 'Публичные упражнения' },
}) {
  return (
    <div className={`${styles.tabs} ${className}`.trim()}>
      <button
        type="button"
        className={`${styles.tab} ${value === 'mine' ? styles.tabActive : ''}`}
        onClick={() => onChange?.('mine')}
      >
        {labels?.mine || 'Мои упражнения'}
      </button>
      <button
        type="button"
        className={`${styles.tab} ${value === 'public' ? styles.tabActive : ''}`}
        onClick={() => onChange?.('public')}
      >
        {labels?.public || 'Публичные упражнения'}
      </button>
    </div>
  );
}

