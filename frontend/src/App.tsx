import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth';
import Landing from './pages/Landing';
import { Login, Register } from './pages/Auth';
import { Spinner } from './components/ui';

// Lazy-loaded: these pull in the heavier stuff (Framer Motion-heavy
// screens, Socket.IO + Razorpay checkout on Treasury, the whole BakraWheel
// game) — bundling them all eagerly meant every visitor downloaded and
// parsed ALL of it just to see the login screen. Splitting per-route means
// a phone on a slow connection only fetches the page it's actually on.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SquadPage = lazy(() => import('./pages/SquadPage'));
const Wrapped = lazy(() => import('./pages/Wrapped'));
const TreasuryPage = lazy(() => import('./pages/TreasuryPage'));
const TripsPage = lazy(() => import('./pages/TripsPage'));
const TripDetailPage = lazy(() => import('./pages/TripDetailPage'));

const PageLoader = () => <main className="flex min-h-screen items-center justify-center"><Spinner /></main>;

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <Suspense fallback={<PageLoader />}>
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
    </Suspense>
  );
}
