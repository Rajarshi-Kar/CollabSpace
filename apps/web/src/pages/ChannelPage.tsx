import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { connectSocket, joinRoom, leaveRoom } from '../lib/socket';
import { useAuthStore } from '../stores/auth';

interface Message {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

interface DomainEvent {
  type: string;
  payload: { channelId?: string; [key: string]: unknown };
}

export function ChannelPage() {
  const { workspaceId, channelId } = useParams<{ workspaceId: string; channelId: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workspaceId || !channelId) return;
    api<Message[]>(`/workspaces/${workspaceId}/channels/${channelId}/messages`).then((msgs) =>
      setMessages([...msgs].reverse()),
    );
  }, [workspaceId, channelId]);

  useEffect(() => {
    if (!channelId || !accessToken) return;
    const socket = connectSocket(accessToken);
    const room = `channel:${channelId}`;
    joinRoom(room);

    const onEvent = (event: DomainEvent) => {
      if (event.type === 'message.sent' && event.payload.channelId === channelId) {
        // The domain event only carries ids, not the message body, so
        // re-fetch the latest page rather than trying to reconstruct the
        // row client-side from a partial payload.
        api<Message[]>(`/workspaces/${workspaceId}/channels/${channelId}/messages`).then((msgs) =>
          setMessages([...msgs].reverse()),
        );
      }
    };
    socket.on('domain-event', onEvent);

    return () => {
      socket.off('domain-event', onEvent);
      leaveRoom(room);
    };
  }, [channelId, workspaceId, accessToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId || !channelId || !body.trim()) return;
    await api(`/workspaces/${workspaceId}/channels/${channelId}/messages`, {
      method: 'POST',
      body: { body },
    });
    setBody('');
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-slate-200 px-4 py-2">
        <Link to=".." relative="path" className="text-sm text-slate-500 hover:text-slate-900">
          ← Channels
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="text-slate-400 text-xs mr-2">{new Date(m.createdAt).toLocaleTimeString()}</span>
            <span className="text-slate-900">{m.body}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={onSend} className="flex gap-2 border-t border-slate-200 px-4 py-3">
        <input
          placeholder="Message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <button type="submit" className="rounded bg-slate-900 text-white text-sm px-4 py-2">
          Send
        </button>
      </form>
    </div>
  );
}
