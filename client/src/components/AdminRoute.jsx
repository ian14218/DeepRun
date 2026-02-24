import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user?.is_admin) return <Navigate to="/dashboard" replace />;
  return children;
}
