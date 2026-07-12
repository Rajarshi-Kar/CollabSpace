import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Task {
  id: string;
  title: string;
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
  priority: string;
}

const STATUSES: Task['status'][] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const STATUS_LABELS: Record<Task['status'], string> = {
  BACKLOG: 'Backlog',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};

// A column-select dropdown rather than drag-and-drop: the backend already
// exposes the fractional-rank /move endpoint a real Kanban drag would use,
// but wiring pointer-based DnD is a separate, sizeable chunk of work left
// for later — this gets task status changes working end to end now.
export function ProjectBoardPage() {
  const { workspaceId, projectId } = useParams<{ workspaceId: string; projectId: string }>();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState('');

  function reload() {
    if (!workspaceId || !projectId) return;
    api<Task[]>(`/workspaces/${workspaceId}/projects/${projectId}/tasks`).then(setTasks).catch(() => setTasks([]));
  }

  useEffect(reload, [workspaceId, projectId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId || !projectId || !title.trim()) return;
    await api(`/workspaces/${workspaceId}/projects/${projectId}/tasks`, {
      method: 'POST',
      body: { title },
    });
    setTitle('');
    reload();
  }

  async function onStatusChange(taskId: string, status: Task['status']) {
    if (!workspaceId || !projectId) return;
    await api(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/move`, {
      method: 'POST',
      body: { status },
    });
    reload();
  }

  return (
    <div className="px-6 py-6">
      <Link to=".." relative="path" className="text-sm text-slate-500 hover:text-slate-900">
        ← Projects
      </Link>
      <h1 className="text-lg font-semibold text-slate-900 mt-2 mb-4">Board</h1>

      <form onSubmit={onCreate} className="flex gap-2 mb-6 max-w-md">
        <input
          placeholder="New task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <button type="submit" className="rounded bg-slate-900 text-white text-sm px-4 py-2">
          Add task
        </button>
      </form>

      {tasks === null && <p className="text-sm text-slate-500">Loading…</p>}

      {tasks && (
        <div className="grid grid-cols-5 gap-3">
          {STATUSES.map((status) => (
            <div key={status} className="rounded border border-slate-200 bg-slate-50/50">
              <div className="px-3 py-2 text-xs font-medium text-slate-500 border-b border-slate-200">
                {STATUS_LABELS[status]}
              </div>
              <div className="p-2 space-y-2 min-h-[100px]">
                {tasks
                  .filter((t) => t.status === status)
                  .map((task) => (
                    <div key={task.id} className="rounded border border-slate-200 bg-white px-2 py-2 text-sm">
                      <div className="text-slate-900">{task.title}</div>
                      <select
                        value={task.status}
                        onChange={(e) => onStatusChange(task.id, e.target.value as Task['status'])}
                        className="mt-1 w-full text-xs text-slate-500 border border-slate-200 rounded px-1 py-0.5"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
