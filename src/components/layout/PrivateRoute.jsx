// src/components/layout/PrivateRoute.jsx
import { Navigate } from 'react-router-dom';
import pb from '../../lib/pocketbase';

function PrivateRoute({ children }) {
  const isAuthenticated = pb.authStore.isValid;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRoute;