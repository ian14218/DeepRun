import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getStandings } from '../services/standingsService';
import StandingsTable from '../components/StandingsTable';
import { Skeleton } from '@/components/ui/skeleton';

export default function Standings() {
  const { id } = useParams();
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getStandings(id)
      .then(setStandings)
      .catch(() => setError('Failed to load standings.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/leagues/${id}`} className="text-primary hover:underline text-sm">
          ← Back to League
        </Link>
        <h1 className="text-3xl font-bold">Standings</h1>
      </div>

      {error && <p className="text-destructive mb-4">{error}</p>}

      <StandingsTable standings={standings} leagueId={id} />
    </div>
  );
}
