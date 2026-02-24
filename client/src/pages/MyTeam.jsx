import { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLeague } from '../services/leagueService';
import { Skeleton } from '@/components/ui/skeleton';

export default function MyTeam() {
  const { id: leagueId } = useParams();
  const { user } = useAuth();
  const [memberId, setMemberId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const league = await getLeague(leagueId);
        const myMember = league.members.find((m) => m.user_id === user.id);
        if (!myMember) throw new Error('You are not a member of this league.');
        setMemberId(myMember.id);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leagueId, user.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) return <p className="text-destructive">{error}</p>;

  if (memberId) {
    return <Navigate to={`/leagues/${leagueId}/team/${memberId}`} replace />;
  }

  return null;
}
