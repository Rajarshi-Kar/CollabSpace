import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

interface ProjectSummary {
  id: string;
  name: string;
  key: string;
}

export function ProjectsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!workspaceId) return;
    api<ProjectSummary[]>(`/workspaces/${workspaceId}/projects`).then(setProjects).catch(() => setProjects([]));
  }

  useEffect(reload, [workspaceId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setError(null);
    try {
      await api(`/workspaces/${workspaceId}/projects`, { method: 'POST', body: { name, key: key.toUpperCase() } });
      setName('');
      setKey('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create project');
    }
  }

  return (
    <div className="px-6 py-6">
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Projects</h1>

      <form onSubmit={onCreate} className="flex gap-2 mb-6">
        <input
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <input
          placeholder="KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
          pattern="[A-Za-z0-9]{2,10}"
          className="w-28 rounded border border-slate-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <button type="submit" className="rounded bg-slate-900 text-white text-sm px-4 py-2">
          Create
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {projects === null && <p className="text-sm text-slate-500">Loading…</p>}
      {projects?.length === 0 && <p className="text-sm text-slate-500">No projects yet.</p>}

      <ul className="space-y-1">
        {projects?.map((p) => (
          <li key={p.id}>
            <Link to={p.id} className="block rounded px-3 py-2 text-sm text-slate-900 hover:bg-slate-50">
              {p.name} <span className="text-slate-400">· {p.key}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
