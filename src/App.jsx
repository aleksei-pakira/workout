import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import pb from './lib/pocketbase';
import PrivateRoute from './components/layout/PrivateRoute';
import { CoachSessionProvider } from './context/CoachSessionContext';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ExercisesPage from './pages/ExercisesPage';
import WorkoutPlanPage from './pages/WorkoutPlanPage';
import WorkoutCalendarPage from './pages/WorkoutCalendarPage';
import WorkoutCalendarEditPage from './pages/WorkoutCalendarEditPage';
import JoinTrainerPage from './pages/JoinTrainerPage';
import TrainerClientsPage from './pages/TrainerClientsPage';

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
      <CoachSessionProvider>
        <Routes>
          <Route path="/login" element={
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
          } />

          <Route path="/register" element={
            isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />
          } />

          <Route path="/join/:code?" element={
            <PrivateRoute>
              <JoinTrainerPage />
            </PrivateRoute>
          } />

          <Route path="/" element={
            <PrivateRoute>
              <HomePage />
            </PrivateRoute>
          } />

          <Route path="/workouts" element={<Navigate to="/workouts/calendar" replace />} />

          <Route path="/clients" element={
            <PrivateRoute>
              <TrainerClientsPage />
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

          <Route path="/workouts/:id/calendar-edit" element={
            <PrivateRoute>
              <WorkoutCalendarEditPage />
            </PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CoachSessionProvider>
    </BrowserRouter>
  );
}

export default App;
