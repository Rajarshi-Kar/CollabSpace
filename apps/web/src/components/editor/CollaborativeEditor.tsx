import { useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

interface CollaborativeEditorProps {
  documentId: string;
  accessToken: string;
  userName: string;
  userColor: string;
}

// Muted, low-saturation cursor colors — avoid the default bright-purple
// "AI demo" palette.
const CURSOR_COLORS = ['#6b7280', '#7a8a7a', '#8a7a6b', '#6b7a8a', '#8a6b7a'];

export function CollaborativeEditor({ documentId, accessToken, userName, userColor }: CollaborativeEditorProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const ydoc = useMemo(() => new Y.Doc(), [documentId]);

  const provider = useMemo(() => {
    const wsUrl = (import.meta.env.VITE_API_WS_URL ?? 'ws://localhost:4000') + '/yjs';
    return new WebsocketProvider(wsUrl, documentId, ydoc, {
      params: { token: accessToken },
    });
  }, [ydoc, documentId, accessToken]);

  // Persists the doc to IndexedDB so edits made offline survive a reload and
  // sync automatically once the WebsocketProvider reconnects.
  const persistence = useMemo(() => new IndexeddbPersistence(documentId, ydoc), [ydoc, documentId]);

  useEffect(() => {
    const onStatus = (event: { status: 'connecting' | 'connected' | 'disconnected' }) => setStatus(event.status);
    provider.on('status', onStatus);
    return () => {
      provider.off('status', onStatus);
      provider.destroy();
      persistence.destroy();
      ydoc.destroy();
    };
  }, [provider, persistence, ydoc]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false }), // history is handled by the Yjs CRDT instead
        Collaboration.configure({ document: ydoc, field: 'default' }),
        CollaborationCursor.configure({
          provider,
          user: { name: userName, color: userColor },
        }),
      ],
      editorProps: {
        attributes: {
          class: 'prose prose-neutral max-w-none focus:outline-none min-h-[60vh] px-4 py-3',
        },
      },
    },
    [ydoc, provider],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
        <span
          className={`h-2 w-2 rounded-full ${
            status === 'connected' ? 'bg-slate-500' : status === 'connecting' ? 'bg-slate-300' : 'bg-slate-400'
          }`}
        />
        {status === 'connected' ? 'Synced' : status === 'connecting' ? 'Connecting…' : 'Offline — changes saved locally'}
      </div>
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
    </div>
  );
}

export function pickCursorColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}
