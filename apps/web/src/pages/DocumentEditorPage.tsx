import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CollaborativeEditor, pickCursorColor } from '../components/editor/CollaborativeEditor';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

interface DocumentDetail {
  id: string;
  title: string;
}

export function DocumentEditorPage() {
  const { workspaceId, documentId } = useParams<{ workspaceId: string; documentId: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);

  useEffect(() => {
    if (!workspaceId || !documentId) return;
    api<DocumentDetail>(`/workspaces/${workspaceId}/documents/${documentId}`)
      .then(setDoc)
      .catch(() => undefined);
  }, [workspaceId, documentId]);

  if (!documentId || !accessToken || !user) return null;

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
        <Link to=".." relative="path" className="text-sm text-slate-500 hover:text-slate-900">
          ← Documents
        </Link>
        {doc && <span className="text-sm text-slate-900 font-medium">{doc.title}</span>}
      </div>
      <CollaborativeEditor
        documentId={documentId}
        accessToken={accessToken}
        userName={user.displayName}
        userColor={pickCursorColor(user.id)}
      />
    </div>
  );
}
