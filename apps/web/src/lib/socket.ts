import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

interface ConnectionState {
  status: 'idle' | 'connecting' | 'connected' | 'disconnected';
  setStatus: (status: ConnectionState['status']) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));

let socket: Socket | null = null;

// socket.io-client already retries with exponential backoff by default; we
// just tune the bounds and surface connection status for the UI to react to.
export function connectSocket(accessToken: string): Socket {
  if (socket) return socket;

  useConnectionStore.getState().setStatus('connecting');

  socket = io(import.meta.env.VITE_API_URL ?? 'http://localhost:4000', {
    auth: { token: accessToken },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
  });

  socket.on('connect', () => useConnectionStore.getState().setStatus('connected'));
  socket.on('disconnect', () => useConnectionStore.getState().setStatus('disconnected'));
  socket.on('connect_error', () => useConnectionStore.getState().setStatus('disconnected'));

  return socket;
}

export function joinRoom(room: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!socket) return resolve(false);
    socket.emit('room:join', room, (ok: boolean) => resolve(ok));
  });
}

export function leaveRoom(room: string) {
  socket?.emit('room:leave', room);
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  useConnectionStore.getState().setStatus('idle');
}
