import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Analytics {
  projectProgress: Array<{ projectId: string; name: string; key: string; totalTasks: number; doneTasks: number; overdueTasks: number; completionRate: number }>;
  taskCompletion: { total: number; done: number; rate: number };
  engagement: { activeUsers: number };
  storage: { usedBytes: string };
  counts: { documents: number; channels: number; projects: number };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-200 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export function OverviewPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    api<Analytics>(`/workspaces/${workspaceId}/analytics`).then(setAnalytics).catch(() => setAnalytics(null));
  }, [workspaceId]);

  return (
    <div className="px-6 py-6">
      <h1 className="text-lg font-semibold text-slate-900 mb-6">Overview</h1>

      {!analytics && <p className="text-sm text-slate-500">Loading…</p>}

      {analytics && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <Stat label="Documents" value={analytics.counts.documents} />
            <Stat label="Projects" value={analytics.counts.projects} />
            <Stat label="Channels" value={analytics.counts.channels} />
            <Stat label="Active users (30d)" value={analytics.engagement.activeUsers} />
            <Stat label="Tasks completed" value={`${analytics.taskCompletion.done} / ${analytics.taskCompletion.total}`} />
            <Stat label="Storage used" value={`${(Number(analytics.storage.usedBytes) / 1_048_576).toFixed(1)} MB`} />
          </div>

          <h2 className="text-sm font-medium text-slate-900 mb-3">Project progress</h2>
          <div className="space-y-2">
            {analytics.projectProgress.map((p) => (
              <div key={p.projectId} className="rounded border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-900">{p.name} <span className="text-slate-400">· {p.key}</span></span>
                  <span className="text-slate-500">{p.doneTasks}/{p.totalTasks} done{p.overdueTasks > 0 ? ` · ${p.overdueTasks} overdue` : ''}</span>
                </div>
                <div className="mt-2 h-1.5 rounded bg-slate-100">
                  <div
                    className="h-1.5 rounded bg-slate-500"
                    style={{ width: `${Math.round(p.completionRate * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {analytics.projectProgress.length === 0 && <p className="text-sm text-slate-500">No projects yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
