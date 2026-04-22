// src/pages/WorkoutCreatePage.jsx
import WorkoutForm from '../components/workouts/WorkoutForm';
import Header from '../components/layout/Header';
import styles from './WorkoutCreatePage.module.css';

function WorkoutCreatePage() {
  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        <WorkoutForm />
      </div>
    </div>
  );
}

export default WorkoutCreatePage;