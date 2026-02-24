import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, RotateCcw, Trash2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { getAdminLeagues, deleteAdminLeague, resetAdminDraft } from '../../services/adminService';
import { toast } from 'sonner';

const STATUS_MAP = {
  pre_draft: { label: 'Pre-Draft', variant: 'secondary' },
  in_progress: { label: 'Drafting', variant: 'default' },
  completed: { label: 'Completed', variant: 'outline' },
};

export default function AdminLeagues() {
  const navigate = useNavigate();
  const [data, setData] = useState({ leagues: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const fetchLeagues = useCallback((s = search, status = statusFilter, p = 1) => {
    setLoading(true);
    getAdminLeagues(s, status, p, 20)
      .then(setData)
      .catch(() => toast.error('Failed to load leagues'))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  useEffect(() => {
    fetchLeagues('', '', 1);
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    fetchLeagues(search, statusFilter, 1);
  }

  function handleStatusChange(val) {
    const newStatus = val === 'all' ? '' : val;
    setStatusFilter(newStatus);
    fetchLeagues(search, newStatus, 1);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAdminLeague(deleteTarget.id);
      toast.success(`League "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      fetchLeagues();
    } catch {
      toast.error('Failed to delete league');
    }
  }

  async function handleReset() {
    if (!resetTarget) return;
    try {
      await resetAdminDraft(resetTarget.id);
      toast.success(`Draft reset for "${resetTarget.name}"`);
      setResetTarget(null);
      fetchLeagues();
    } catch {
      toast.error('Failed to reset draft');
    }
  }

  const totalPages = Math.ceil(data.total / data.limit);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Leagues Management</h1>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <CardTitle className="text-lg">All Leagues ({data.total})</CardTitle>
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  placeholder="Search leagues..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-56"
                />
                <Button type="submit" variant="secondary" size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </form>
            </div>
            <Tabs value={statusFilter || 'all'} onValueChange={handleStatusChange}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pre_draft">Pre-Draft</TabsTrigger>
                <TabsTrigger value="in_progress">Drafting</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Commissioner</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : data.leagues.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No leagues found
                  </TableCell>
                </TableRow>
              ) : (
                data.leagues.map((l) => {
                  const statusInfo = STATUS_MAP[l.draft_status] || { label: l.draft_status, variant: 'outline' };
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell className="text-muted-foreground">{l.commissioner_name || '-'}</TableCell>
                      <TableCell>
                        {l.member_count}/{l.team_count}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(l.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="View details"
                            onClick={() => navigate(`/admin/leagues/${l.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {l.draft_status !== 'pre_draft' && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Reset draft"
                              onClick={() => setResetTarget(l)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Delete league"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(l)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => fetchLeagues(search, statusFilter, data.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= totalPages}
                  onClick={() => fetchLeagues(search, statusFilter, data.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete League</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? All members, picks, and data will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation */}
      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Draft</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset the draft for <strong>{resetTarget?.name}</strong>? All picks will be deleted and draft positions cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset}>Reset Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
