import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface FileSummary {
  id: string;
  name: string;
  mimeType: string;
  currentVersion: { sizeBytes: string } | null;
}

// Mirrors the server's presigned-upload contract: request a URL, PUT the
// bytes straight to MinIO (the API never sees the file body), then tell the
// API to finalize so it can verify the real size against quota.
async function uploadFile(workspaceId: string, file: File) {
  const { fileId, uploadUrl } = await api<{ fileId: string; uploadUrl: string }>(
    `/workspaces/${workspaceId}/files/upload-url`,
    { method: 'POST', body: { name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size } },
  );
  await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  await api(`/workspaces/${workspaceId}/files/${fileId}/complete`, { method: 'POST' });
}

export function FilesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [files, setFiles] = useState<FileSummary[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reload() {
    if (!workspaceId) return;
    api<FileSummary[]>(`/workspaces/${workspaceId}/files`).then(setFiles).catch(() => setFiles([]));
  }

  useEffect(reload, [workspaceId]);

  async function onSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    setUploading(true);
    setError(null);
    try {
      await uploadFile(workspaceId, file);
      reload();
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onDownload(fileId: string) {
    if (!workspaceId) return;
    const { url } = await api<{ url: string }>(`/workspaces/${workspaceId}/files/${fileId}/download`);
    window.open(url, '_blank');
  }

  return (
    <div className="px-6 py-6">
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Files</h1>

      <div className="mb-6">
        <input ref={inputRef} type="file" onChange={onSelect} disabled={uploading} className="text-sm" />
        {uploading && <span className="ml-2 text-sm text-slate-500">Uploading…</span>}
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      </div>

      {files === null && <p className="text-sm text-slate-500">Loading…</p>}
      {files?.length === 0 && <p className="text-sm text-slate-500">No files yet.</p>}

      <ul className="space-y-1">
        {files?.map((f) => (
          <li key={f.id} className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-slate-50">
            <span className="text-slate-900">{f.name}</span>
            <div className="flex items-center gap-3 text-slate-400">
              <span>{f.currentVersion ? `${(Number(f.currentVersion.sizeBytes) / 1024).toFixed(1)} KB` : ''}</span>
              <button onClick={() => onDownload(f.id)} className="text-slate-500 hover:text-slate-900">
                Download
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
