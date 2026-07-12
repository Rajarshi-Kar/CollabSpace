import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

interface DocumentSummary {
  id: string;
  title: string;
  parentId: string | null;
  updatedAt: string;
}

export function DocumentsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!workspaceId) return;
    api<DocumentSummary[]>(`/workspaces/${workspaceId}/documents`).then(setDocuments).catch(() => setDocuments([]));
  }

  useEffect(reload, [workspaceId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId || !title.trim()) return;
    setError(null);
    try {
      await api(`/workspaces/${workspaceId}/documents`, { method: 'POST', body: { title } });
      setTitle('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create document');
    }
  }

  return (
    <div className="px-6 py-6">
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Documents</h1>

      <form onSubmit={onCreate} className="flex gap-2 mb-6">
        <input
          placeholder="New document title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <button type="submit" className="rounded bg-slate-900 text-white text-sm px-4 py-2">
          Create
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {documents === null && <p className="text-sm text-slate-500">Loading…</p>}
      {documents?.length === 0 && <p className="text-sm text-slate-500">No documents yet.</p>}

      <ul className="space-y-1">
        {documents?.map((doc) => (
          <li key={doc.id}>
            <Link to={doc.id} className="block rounded px-3 py-2 text-sm text-slate-900 hover:bg-slate-50">
              {doc.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
