import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageCircle, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DraftChat({ leagueId }) {
  const { user } = useAuth();
  const socket = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api.get(`/api/leagues/${leagueId}/draft/messages`)
      .then((res) => setMessages(res.data))
      .catch(() => {});
  }, [leagueId]);

  useEffect(() => {
    if (!socket) return;

    const handler = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };
    socket.on('draft:message', handler);
    return () => socket.off('draft:message', handler);
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !socket) return;

    socket.emit('draft:message', {
      leagueId,
      message: trimmed,
    });
    setInput('');
  }

  return (
    <Card className="flex flex-col h-full">
      <div
        className="flex items-center justify-between p-3 border-b cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Draft Chat</span>
        </div>
        <span className="text-xs text-muted-foreground">{collapsed ? 'Show' : 'Hide'}</span>
      </div>

      {!collapsed && (
        <CardContent className="flex flex-col flex-1 p-0 min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-64 lg:max-h-96">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No messages yet</p>
            )}
            {messages.map((msg, i) => (
              <div key={msg.id || i} className="text-sm">
                <span className={cn(
                  'font-semibold',
                  msg.user_id === user.id ? 'text-accent' : 'text-primary'
                )}>
                  {msg.username}
                </span>
                <span className="text-muted-foreground">: </span>
                <span className="text-foreground">{msg.message}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="flex gap-2 p-3 border-t">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="text-sm"
              maxLength={500}
            />
            <Button type="submit" size="icon" variant="ghost" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
