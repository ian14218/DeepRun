import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { getStandings, getMrIrrelevant } from '../services/standingsService';
import StandingsTable from '../components/StandingsTable';
import MrIrrelevantTracker from '../components/MrIrrelevantTracker';
import { Skeleton } from '@/components/ui/skeleton';

export default function Standings() {
  useDocumentTitle('Standings');
  const { id } = useParams();
  const [standings, setStandings] = useState([]);
  const [mrIrrelevant, setMrIrrelevant] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getStandings(id), getMrIrrelevant(id)])
      .then(([standingsData, mrData]) => {
        setStandings(standingsData.standings || standingsData);
        setMrIrrelevant(mrData);
      })
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

      {mrIrrelevant.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">Mr. Irrelevant Tracker</h2>
          <MrIrrelevantTracker entries={mrIrrelevant} />
        </div>
      )}
    </div>
  );
}
