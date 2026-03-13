import { useEffect, useState, useCallback } from 'react';
import { Cpu, Shield, ShieldOff, Trash2, Search, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { getAdminUsers, deleteAdminUser, toggleAdminStatus, resetUserPassword } from '../../services/adminService';
import { toast } from 'sonner';

export default function AdminUsers() {
  const [data, setData] = useState({ users: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = useCallback((s = search, p = data.page) => {
    setLoading(true);
    getAdminUsers(s, p, 20)
      .then(setData)
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  }, [search, data.page]);

  useEffect(() => {
    fetchUsers('', 1);
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    fetchUsers(search, 1);
  }

  async function handleToggleAdmin(user) {
    try {
      await toggleAdminStatus(user.id, !user.is_admin);
      toast.success(`${user.username} ${user.is_admin ? 'demoted' : 'promoted'}`);
      fetchUsers();
    } catch {
      toast.error('Failed to update admin status');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAdminUser(deleteTarget.id);
      toast.success(`${deleteTarget.username} deleted`);
      setDeleteTarget(null);
      fetchUsers();
    } catch {
      toast.error('Failed to delete user');
    }
  }

  async function handleResetPassword() {
    if (!resetTarget || !newPassword) return;
    try {
      await resetUserPassword(resetTarget.id, newPassword);
      toast.success(`Password reset for ${resetTarget.username}`);
      setResetTarget(null);
      setNewPassword('');
    } catch {
      toast.error('Failed to reset password');
    }
  }

  const totalPages = Math.ceil(data.total / data.limit);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Users Management</h1>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-lg">All Users ({data.total})</CardTitle>
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
              />
              <Button type="submit" variant="secondary" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Admin</TableHead>
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
              ) : data.users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                data.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {u.is_bot ? (
                        <Badge variant="secondary" className="gap-1">
                          <Cpu className="h-3 w-3" /> CPU
                        </Badge>
                      ) : (
                        <Badge variant="outline">Human</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.is_admin ? (
                        <Badge variant="destructive" className="gap-1">
                          <Shield className="h-3 w-3" /> Admin
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!u.is_bot && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Reset password"
                              onClick={() => { setResetTarget(u); setNewPassword(''); }}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title={u.is_admin ? 'Revoke admin' : 'Make admin'}
                              onClick={() => handleToggleAdmin(u)}
                            >
                              {u.is_admin ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Delete user"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
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
                  onClick={() => fetchUsers(search, data.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= totalPages}
                  onClick={() => fetchUsers(search, data.page + 1)}
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
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.username}</strong>? This will remove all their league memberships and draft picks. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{resetTarget?.username}</strong> ({resetTarget?.email}).
            </DialogDescription>
          </DialogHeader>
          <Input
            type="text"
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={newPassword.length < 8}>Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
