import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AppLayout from './components/layout/AppLayout';
import LeagueLayout from './components/layout/LeagueLayout';
import AdminLayout from './components/layout/AdminLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateLeague from './pages/CreateLeague';
import JoinLeague from './pages/JoinLeague';
import LeagueDetail from './pages/LeagueDetail';
import DraftRoom from './pages/DraftRoom';
import Standings from './pages/Standings';
import MyTeam from './pages/MyTeam';
import TeamRoster from './pages/TeamRoster';
import Scoreboard from './pages/Scoreboard';
import Bracket from './pages/Bracket';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminLeagues from './pages/admin/AdminLeagues';
import AdminLeagueDetail from './pages/admin/AdminLeagueDetail';
import AdminTournament from './pages/admin/AdminTournament';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            {/* Public — no Navbar */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

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

              {/* Admin — wrapped in AdminRoute guard + AdminLayout */}
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="leagues" element={<AdminLeagues />} />
                <Route path="leagues/:id" element={<AdminLeagueDetail />} />
                <Route path="tournament" element={<AdminTournament />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
