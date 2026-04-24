// src/pages/WorkoutDetailPage.jsx
import { useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import WorkoutDetailContent from '../components/workouts/WorkoutDetailContent';
import styles from './WorkoutDetailPage.module.css';

function WorkoutDetailPage() {
  const { id } = useParams();
  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.content}>
        <WorkoutDetailContent workoutId={id} variant="page" />
      </div>
    </div>
  );
}

export default WorkoutDetailPage;