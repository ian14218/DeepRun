import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Trash2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { getAdminLeagueDetail, deleteAdminLeague, resetAdminDraft } from '../../services/adminService';
import { toast } from 'sonner';

const STATUS_MAP = {
  pre_draft: { label: 'Pre-Draft', variant: 'secondary' },
  in_progress: { label: 'Drafting', variant: 'default' },
  completed: { label: 'Completed', variant: 'outline' },
};

export default function AdminLeagueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAdminLeagueDetail(id)
      .then(setLeague)
      .catch(() => toast.error('Failed to load league'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    try {
      await deleteAdminLeague(id);
      toast.success('League deleted');
      navigate('/admin/leagues');
    } catch {
      toast.error('Failed to delete league');
    }
  }

  async function handleReset() {
    try {
      await resetAdminDraft(id);
      toast.success('Draft reset');
      setShowReset(false);
      // Refresh
      const updated = await getAdminLeagueDetail(id);
      setLeague(updated);
    } catch {
      toast.error('Failed to reset draft');
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading league...</div>;
  }

  if (!league) {
    return <div className="text-muted-foreground">League not found</div>;
  }

  const statusInfo = STATUS_MAP[league.draft_status] || { label: league.draft_status, variant: 'outline' };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 gap-1.5" onClick={() => navigate('/admin/leagues')}>
        <ArrowLeft className="h-4 w-4" /> Back to Leagues
      </Button>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{league.name}</h1>
          <p className="text-muted-foreground text-sm">Commissioner: {league.commissioner_name || '-'}</p>
        </div>
        <div className="flex gap-2">
          {league.draft_status !== 'pre_draft' && (
            <Button variant="outline" size="sm" onClick={() => setShowReset(true)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset Draft
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete League
          </Button>
        </div>
      </div>

      {/* Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">League Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Status</p>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Team Count</p>
              <p className="font-medium">{league.team_count}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Roster Size</p>
              <p className="font-medium">{league.roster_size}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Invite Code</p>
              <button
                className="font-mono text-primary hover:underline"
                onClick={() => {
                  navigator.clipboard.writeText(league.invite_code);
                  toast.success('Copied!');
                }}
                title="Click to copy"
              >
                {league.invite_code} <Copy className="inline h-3 w-3" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Members ({league.members?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Team Name</TableHead>
                <TableHead>Draft Position</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(league.members || []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.username}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>{m.team_name || '-'}</TableCell>
                  <TableCell>{m.draft_position != null ? m.draft_position + 1 : '-'}</TableCell>
                  <TableCell>
                    {m.is_bot ? (
                      <Badge variant="secondary">CPU</Badge>
                    ) : (
                      <Badge variant="outline">Human</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Picks */}
      {league.picks && league.picks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Draft Picks ({league.picks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Picked By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {league.picks.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.pick_number}</TableCell>
                    <TableCell>{p.round}</TableCell>
                    <TableCell>{p.player_name}</TableCell>
                    <TableCell>{p.player_position || '-'}</TableCell>
                    <TableCell>{p.picker_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete League</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{league.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset dialog */}
      <Dialog open={showReset} onOpenChange={setShowReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Draft</DialogTitle>
            <DialogDescription>
              This will delete all picks and reset the draft to pre-draft status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReset(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset}>Reset Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
