import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface SearchHit {
  type: string;
  id: string;
  title?: string;
  name?: string;
  body?: string;
  [key: string]: unknown;
}

function hitLabel(hit: SearchHit): string {
  return hit.title ?? hit.name ?? hit.body ?? hit.id;
}

export function SearchPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId || !query.trim()) return;
    setLoading(true);
    try {
      const res = await api<{ results: SearchHit[] }>(`/workspaces/${workspaceId}/search`, {
        query: { q: query },
      });
      setResults(res.results);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Search</h1>

      <form onSubmit={onSearch} className="flex gap-2 mb-6 max-w-lg">
        <input
          placeholder="Search documents, tasks, messages, files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <button type="submit" className="rounded bg-slate-900 text-white text-sm px-4 py-2">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {results?.length === 0 && <p className="text-sm text-slate-500">No results.</p>}

      <ul className="space-y-1">
        {results?.map((hit) => (
          <li key={`${hit.type}-${hit.id}`} className="rounded border border-slate-200 px-3 py-2 text-sm">
            <span className="text-xs uppercase text-slate-400 mr-2">{hit.type}</span>
            <span className="text-slate-900">{hitLabel(hit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
