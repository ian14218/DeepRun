import { Outlet, useParams } from 'react-router-dom';
import LeagueSidebar from '../LeagueSidebar';

export default function LeagueLayout() {
  const { id } = useParams();

  return (
    <div className="flex gap-6">
      {/* Sidebar: hidden on mobile, shown on md+ */}
      <div className="hidden md:block">
        <LeagueSidebar leagueId={id} />
      </div>
      <div className="flex-1 min-w-0">
        {/* Mobile horizontal nav */}
        <div className="md:hidden mb-4">
          <LeagueSidebar leagueId={id} mobile />
        </div>
        <Outlet />
      </div>
    </div>
  );
}
