import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth';

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
}

export function OrgsPage() {
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<OrgSummary[]>('/orgs').then(setOrgs).catch(() => setOrgs([]));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const org = await api<OrgSummary>('/orgs', { method: 'POST', body: { name, slug } });
      navigate(`/o/${org.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create organization');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
        <span className="text-sm font-medium text-slate-900">CollabSpace</span>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{user?.displayName}</span>
          <button
            onClick={() => {
              clear();
              navigate('/login');
            }}
            className="text-slate-500 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-12">
        <h1 className="text-lg font-semibold text-slate-900 mb-4">Your organizations</h1>

        {orgs === null && <p className="text-sm text-slate-500">Loading…</p>}
        {orgs?.length === 0 && <p className="text-sm text-slate-500 mb-6">No organizations yet.</p>}

        <ul className="space-y-2 mb-8">
          {orgs?.map((org) => (
            <li key={org.id}>
              <Link
                to={`/o/${org.id}`}
                className="block rounded border border-slate-200 px-4 py-3 text-sm text-slate-900 hover:border-slate-400"
              >
                {org.name}
                <span className="text-slate-400"> · {org.slug}</span>
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="text-sm font-medium text-slate-900 mb-3">Create a new organization</h2>
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
            {creating ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </main>
    </div>
  );
}
