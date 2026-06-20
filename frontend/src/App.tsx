import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth';
import Landing from './pages/Landing';
import { Login, Register } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import SquadPage from './pages/SquadPage';
import Wrapped from './pages/Wrapped';
import TreasuryPage from './pages/TreasuryPage';
import TripsPage from './pages/TripsPage';
import TripDetailPage from './pages/TripDetailPage';
import { Spinner } from './components/ui';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="flex min-h-screen items-center justify-center"><Spinner /></main>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/app" element={<Protected><Dashboard /></Protected>} />
      <Route path="/app/squad/:id" element={<Protected><SquadPage /></Protected>} />
      <Route path="/app/squad/:id/wrapped" element={<Protected><Wrapped /></Protected>} />
      <Route path="/app/squad/:id/treasury" element={<Protected><TreasuryPage /></Protected>} />
      <Route path="/app/squad/:id/trips" element={<Protected><TripsPage /></Protected>} />
      <Route path="/app/squad/:id/trip/:tripId" element={<Protected><TripDetailPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
