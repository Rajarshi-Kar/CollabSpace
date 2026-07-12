import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';

const NAV_ITEMS = [
  { to: '', label: 'Overview', end: true },
  { to: 'documents', label: 'Documents' },
  { to: 'projects', label: 'Projects' },
  { to: 'channels', label: 'Channels' },
  { to: 'files', label: 'Files' },
  { to: 'search', label: 'Search' },
];

export function WorkspaceLayout() {
  const { orgId, workspaceId } = useParams<{ orgId: string; workspaceId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const basePath = `/o/${orgId}/w/${workspaceId}`;

  return (
    <div className="min-h-screen flex bg-white text-slate-900">
      <aside className="w-56 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200">
          <button onClick={() => navigate('/orgs')} className="text-sm text-slate-500 hover:text-slate-900">
            ← Organizations
          </button>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.label}
              to={item.to === '' ? basePath : `${basePath}/${item.to}`}
              end={item.end}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${
                  isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 truncate">{user?.displayName}</span>
          <button
            onClick={() => {
              clear();
              navigate('/login');
            }}
            className="text-xs text-slate-400 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
