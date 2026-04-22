// src/pages/WorkoutCreatePage.jsx
import WorkoutForm from '../components/workouts/WorkoutForm';
import Header from '../components/layout/Header';
import styles from './WorkoutCreatePage.module.css';

function WorkoutCreatePage() {
  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerIcon}>➕</div>
          <div className={styles.headerTitle}>
            <h1>Создание новой тренировки</h1>
            <p>Добавьте упражнения и сразу заполните подходы</p>
          </div>
        </div>
        <WorkoutForm />
      </div>
    </div>
  );
}

export default WorkoutCreatePage;