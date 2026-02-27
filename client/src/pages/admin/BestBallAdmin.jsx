import { useState, useEffect } from 'react';
import {
  getActiveContest,
  createContest,
  updateContestStatus,
  generatePrices,
  getConfig,
  updateConfig,
} from '@/services/bestBallService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_FLOW = ['upcoming', 'open', 'locked', 'live', 'completed'];

export default function BestBallAdmin() {
  const [contest, setContest] = useState(null);
  const [config, setConfigState] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priceResult, setPriceResult] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Create contest form
  const [name, setName] = useState('');
  const [lockDate, setLockDate] = useState('');
  const [budget, setBudget] = useState(8000);
  const [rosterSize, setRosterSize] = useState(8);

  useEffect(() => {
    async function load() {
      try {
        const [c, cfg] = await Promise.all([getActiveContest(), getConfig()]);
        setContest(c);
        setConfigState(cfg);
      } catch {
        // config may fail for non-admin, that's fine for initial load
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const showMessage = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(null); }
    else { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 4000);
  };

  const handleCreate = async () => {
    try {
      const c = await createContest({ name, lock_date: lockDate, budget, roster_size: rosterSize });
      setContest(c);
      showMessage('Contest created');
    } catch (err) {
      showMessage(err.response?.data?.error || 'Failed to create', true);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const updated = await updateContestStatus(contest.id, newStatus);
      setContest(updated);
      showMessage(`Status updated to ${newStatus}`);
    } catch (err) {
      showMessage(err.response?.data?.error || 'Failed to update status', true);
    }
  };

  const handleGeneratePrices = async () => {
    try {
      const result = await generatePrices(contest.id);
      setPriceResult(result);
      showMessage(`Generated prices for ${result.totalPlayers} players`);
    } catch (err) {
      showMessage(err.response?.data?.error || 'Failed to generate prices', true);
    }
  };

  const handleConfigUpdate = async (key, value) => {
    try {
      await updateConfig(key, value);
      const cfg = await getConfig();
      setConfigState(cfg);
      showMessage(`Updated ${key}`);
    } catch (err) {
      showMessage(err.response?.data?.error || 'Failed to update config', true);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const nextStatus = contest
    ? STATUS_FLOW[STATUS_FLOW.indexOf(contest.status) + 1]
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Best Ball Admin</h1>

      {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>}
      {success && <div className="p-3 bg-emerald-500/10 text-emerald-400 text-sm rounded-lg">{success}</div>}

      {/* Active Contest */}
      {contest ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {contest.name}
              <Badge variant="outline">{contest.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Budget</p>
                <p className="font-mono font-semibold">${contest.budget.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Roster Size</p>
                <p className="font-mono font-semibold">{contest.roster_size}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Lock Date</p>
                <p className="font-mono font-semibold text-xs">{new Date(contest.lock_date).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-semibold">{contest.status}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {nextStatus && (
                <Button onClick={() => handleStatusChange(nextStatus)}>
                  Advance to {nextStatus}
                </Button>
              )}
              <Button variant="outline" onClick={handleGeneratePrices}>
                Generate Prices
              </Button>
            </div>

            {priceResult && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm space-y-2">
                <p className="font-semibold">Price Generation Results</p>
                <p>Total players: {priceResult.totalPlayers}</p>
                <p>Price range: ${priceResult.priceRange.min} — ${priceResult.priceRange.max} (avg ${priceResult.priceRange.avg})</p>
                <div className="flex gap-4 flex-wrap">
                  {Object.entries(priceResult.tierBreakdown).map(([tier, count]) => (
                    <span key={tier}>{tier}: {count}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create Contest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Contest Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="March Madness 2025 Best Ball" />
              </div>
              <div>
                <Label htmlFor="lockDate">Lock Date</Label>
                <Input id="lockDate" type="datetime-local" value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="budget">Budget</Label>
                <Input id="budget" type="number" value={budget} onChange={(e) => setBudget(parseInt(e.target.value, 10))} />
              </div>
              <div>
                <Label htmlFor="rosterSize">Roster Size</Label>
                <Input id="rosterSize" type="number" value={rosterSize} onChange={(e) => setRosterSize(parseInt(e.target.value, 10))} />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={!name || !lockDate}>
              Create Contest
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing Config</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {config.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <Label className="w-40 text-sm font-mono">{c.key}</Label>
                <Input
                  className="max-w-xs font-mono text-sm"
                  defaultValue={c.value}
                  onBlur={(e) => {
                    if (e.target.value !== c.value) {
                      handleConfigUpdate(c.key, e.target.value);
                    }
                  }}
                />
                {c.description && (
                  <span className="text-xs text-muted-foreground hidden lg:inline">{c.description}</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
