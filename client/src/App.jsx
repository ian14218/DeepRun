import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AppLayout from './components/layout/AppLayout';
import LeagueLayout from './components/layout/LeagueLayout';
import AdminLayout from './components/layout/AdminLayout';
import { Skeleton } from '@/components/ui/skeleton';

// Eagerly loaded (public / high-traffic)
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateLeague from './pages/CreateLeague';
import JoinLeague from './pages/JoinLeague';
import LeagueDetail from './pages/LeagueDetail';
import ChangePassword from './pages/ChangePassword';

// Lazy-loaded (less frequent / heavy pages)
const DraftRoom = lazy(() => import('./pages/DraftRoom'));
const Standings = lazy(() => import('./pages/Standings'));
const MyTeam = lazy(() => import('./pages/MyTeam'));
const TeamRoster = lazy(() => import('./pages/TeamRoster'));
const Scoreboard = lazy(() => import('./pages/Scoreboard'));
const Bracket = lazy(() => import('./pages/Bracket'));
const BestBall = lazy(() => import('./pages/BestBall'));
const BestBallRoster = lazy(() => import('./pages/BestBallRoster'));
const BestBallLeaderboard = lazy(() => import('./pages/BestBallLeaderboard'));
const BestBallEntry = lazy(() => import('./pages/BestBallEntry'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminLeagues = lazy(() => import('./pages/admin/AdminLeagues'));
const AdminLeagueDetail = lazy(() => import('./pages/admin/AdminLeagueDetail'));
const AdminTournament = lazy(() => import('./pages/admin/AdminTournament'));
const BestBallAdmin = lazy(() => import('./pages/admin/BestBallAdmin'));

function LazyFallback() {
  return <div className="space-y-4 p-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
}

function HomeRedirect() {
  const { user } = useAuth();
  return user ? <Navigate to="/dashboard" replace /> : <Home />;
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Suspense fallback={<LazyFallback />}>
          <Routes>
            {/* Public — no Navbar */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/change-password" element={<ChangePassword />} />

            {/* Protected — wrapped in AppLayout (Navbar + main) */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/leagues/create" element={<CreateLeague />} />
              <Route path="/leagues/join" element={<JoinLeague />} />
              <Route path="/leagues/:id" element={<LeagueDetail />} />

              {/* League sub-pages — wrapped in LeagueLayout (sidebar) */}
              <Route path="/leagues/:id" element={<LeagueLayout />}>
                <Route path="draft" element={<DraftRoom />} />
                <Route path="standings" element={<Standings />} />
                <Route path="my-team" element={<MyTeam />} />
                <Route path="team/:memberId" element={<TeamRoster />} />
                <Route path="scoreboard" element={<Scoreboard />} />
                <Route path="bracket" element={<Bracket />} />
              </Route>

              {/* Best Ball */}
              <Route path="/best-ball" element={<BestBall />} />
              <Route path="/best-ball/lineup" element={<BestBallRoster />} />
              <Route path="/best-ball/leaderboard" element={<BestBallLeaderboard />} />
              <Route path="/best-ball/users/:userId" element={<BestBallEntry />} />

              {/* Admin — wrapped in AdminRoute guard + AdminLayout */}
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="leagues" element={<AdminLeagues />} />
                <Route path="leagues/:id" element={<AdminLeagueDetail />} />
                <Route path="tournament" element={<AdminTournament />} />
                <Route path="best-ball" element={<BestBallAdmin />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
