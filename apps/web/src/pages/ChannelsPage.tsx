import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

interface ChannelSummary {
  id: string;
  name: string | null;
}

export function ChannelsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!workspaceId) return;
    api<ChannelSummary[]>(`/workspaces/${workspaceId}/channels`).then(setChannels).catch(() => setChannels([]));
  }

  useEffect(reload, [workspaceId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setError(null);
    try {
      await api(`/workspaces/${workspaceId}/channels`, { method: 'POST', body: { name } });
      setName('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create channel');
    }
  }

  return (
    <div className="px-6 py-6">
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Channels</h1>

      <form onSubmit={onCreate} className="flex gap-2 mb-6">
        <input
          placeholder="channel-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          pattern="[a-z0-9-]+"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <button type="submit" className="rounded bg-slate-900 text-white text-sm px-4 py-2">
          Create
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {channels === null && <p className="text-sm text-slate-500">Loading…</p>}
      {channels?.length === 0 && <p className="text-sm text-slate-500">No channels yet.</p>}

      <ul className="space-y-1">
        {channels?.map((c) => (
          <li key={c.id}>
            <Link to={c.id} className="block rounded px-3 py-2 text-sm text-slate-900 hover:bg-slate-50">
              # {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
