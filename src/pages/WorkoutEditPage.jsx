// src/pages/WorkoutEditPage.jsx
import { useParams } from 'react-router-dom';
import WorkoutForm from '../components/workouts/WorkoutForm';
import Header from '../components/layout/Header';
import styles from './WorkoutCreatePage.module.css';

function WorkoutEditPage() {
  const { id } = useParams();

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerIcon}>✏️</div>
          <div className={styles.headerTitle}>
            <h1>Редактирование тренировки</h1>
            <p>Измените упражнения и подходы</p>
          </div>
        </div>
        <WorkoutForm />
      </div>
    </div>
  );
}

export default WorkoutEditPage;