import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import pb from './lib/pocketbase';
import PrivateRoute from './components/layout/PrivateRoute';

// Страницы
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage'; // Добавляем
import HomePage from './pages/HomePage';
import WorkoutsPage from './pages/WorkoutsPage';
import ExercisesPage from './pages/ExercisesPage';
import WorkoutDetailPage from './pages/WorkoutDetailPage';
import WorkoutCreatePage from './pages/WorkoutCreatePage';
import WorkoutPlanPage from './pages/WorkoutPlanPage';
import WorkoutEditPage from './pages/WorkoutEditPage';
import WorkoutCalendarPage from './pages/WorkoutCalendarPage';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(pb.authStore.isValid);

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => {
      setIsAuthenticated(pb.authStore.isValid);
    });
    return unsubscribe;
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Публичные страницы */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        } />

        {/* НОВЫЙ МАРШРУТ */}
        <Route path="/register" element={
          isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />
        } />

        {/* Защищённые страницы */}
        <Route path="/" element={
          <PrivateRoute>
            <HomePage />
          </PrivateRoute>
        } />

        <Route path="/workouts" element={
          <PrivateRoute>
            <WorkoutsPage />
          </PrivateRoute>
        } />

        <Route path="/exercises" element={
          <PrivateRoute>
            <ExercisesPage />
          </PrivateRoute>
        } />

        <Route path="/exercises/library" element={
          <Navigate to="/exercises" replace state={{ tab: 'add' }} />
        } />

        <Route path="/workouts/create" element={
          <PrivateRoute>
            <WorkoutCreatePage />
          </PrivateRoute>
        } />

        <Route path="/workouts/plan" element={
          <PrivateRoute>
            <WorkoutPlanPage />
          </PrivateRoute>
        } />

        <Route path="/workouts/calendar" element={
          <PrivateRoute>
            <WorkoutCalendarPage />
          </PrivateRoute>
        } />

        <Route path="/workouts/:id" element={
          <PrivateRoute>
            <WorkoutDetailPage />
          </PrivateRoute>
        } />

        <Route path="/workouts/:id/edit" element={
          <PrivateRoute>
            <WorkoutEditPage />
          </PrivateRoute>
        } />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;