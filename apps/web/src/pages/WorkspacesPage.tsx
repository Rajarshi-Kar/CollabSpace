import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
}

export function WorkspacesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    api<WorkspaceSummary[]>(`/orgs/${orgId}/workspaces`).then(setWorkspaces).catch(() => setWorkspaces([]));
  }, [orgId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setError(null);
    setCreating(true);
    try {
      const workspace = await api<WorkspaceSummary>(`/orgs/${orgId}/workspaces`, {
        method: 'POST',
        body: { name, slug },
      });
      navigate(`/o/${orgId}/w/${workspace.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create workspace');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
        <Link to="/orgs" className="text-sm text-slate-500 hover:text-slate-900">
          ← Organizations
        </Link>
      </header>

      <main className="max-w-xl mx-auto px-4 py-12">
        <h1 className="text-lg font-semibold text-slate-900 mb-4">Workspaces</h1>

        {workspaces === null && <p className="text-sm text-slate-500">Loading…</p>}
        {workspaces?.length === 0 && <p className="text-sm text-slate-500 mb-6">No workspaces yet.</p>}

        <ul className="space-y-2 mb-8">
          {workspaces?.map((ws) => (
            <li key={ws.id}>
              <Link
                to={`/o/${orgId}/w/${ws.id}`}
                className="block rounded border border-slate-200 px-4 py-3 text-sm text-slate-900 hover:border-slate-400"
              >
                {ws.name}
                <span className="text-slate-400"> · {ws.slug}</span>
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="text-sm font-medium text-slate-900 mb-3">Create a new workspace</h2>
        <form onSubmit={onCreate} className="space-y-3">
          <input
            placeholder="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <input
            placeholder="slug (lowercase, hyphens)"
            required
            pattern="[a-z0-9-]+"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-slate-900 text-white text-sm px-4 py-2 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
      </main>
    </div>
  );
}
