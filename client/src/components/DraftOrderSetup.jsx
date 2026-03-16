import { useState, useRef } from 'react';
import { saveDraftOrder } from '../services/leagueService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { GripVertical, Shuffle, Save, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function DraftOrderSetup({ leagueId, members, customDraftOrder, onOrderSaved }) {
  const [orderedMembers, setOrderedMembers] = useState(() => {
    if (customDraftOrder) {
      // Sort by existing draft_position
      return [...members].sort((a, b) => (a.draft_position || 0) - (b.draft_position || 0));
    }
    return [...members];
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  function handleDragStart(index) {
    dragItem.current = index;
  }

  function handleDragEnter(index) {
    dragOverItem.current = index;
  }

  function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...orderedMembers];
    const [removed] = items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, removed);
    setOrderedMembers(items);
    setSaved(false);
    dragItem.current = null;
    dragOverItem.current = null;
  }

  function handleRandomize() {
    const shuffled = [...orderedMembers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setOrderedMembers(shuffled);
    setSaved(false);
  }

  function handleMoveUp(index) {
    if (index === 0) return;
    const items = [...orderedMembers];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setOrderedMembers(items);
    setSaved(false);
  }

  function handleMoveDown(index) {
    if (index === orderedMembers.length - 1) return;
    const items = [...orderedMembers];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setOrderedMembers(items);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const memberIds = orderedMembers.map((m) => m.id);
      await saveDraftOrder(leagueId, memberIds);
      setSaved(true);
      toast.success('Draft order saved!');
      if (onOrderSaved) onOrderSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save draft order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Draft Order</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRandomize}>
            <Shuffle className="h-3.5 w-3.5 mr-1.5" />
            Randomize
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saved ? (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Order'}
          </Button>
        </div>
      </div>
      {!customDraftOrder && !saved && (
        <p className="text-xs text-muted-foreground mb-2">
          Draft order will be randomized at start unless you save a custom order.
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {orderedMembers.map((m, index) => (
              <li
                key={m.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing',
                  'hover:bg-muted/50 transition-colors select-none'
                )}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-bold text-muted-foreground w-6 text-center shrink-0">
                  {index + 1}
                </span>
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                    {m.username?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm flex-1 truncate">{m.username}</span>
                <div className="flex items-center gap-1">
                  {m.is_bot && (
                    <Badge variant="secondary" className="text-xs">CPU</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                  >
                    <span className="text-xs">&#9650;</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === orderedMembers.length - 1}
                  >
                    <span className="text-xs">&#9660;</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
