import { redis } from '../lib/redis.js';

// One user can have multiple sockets open (multiple tabs/devices). We track
// per-socket membership in a room and derive presence as the set of distinct
// userIds with at least one live socket, so a closed tab doesn't wrongly mark
// the user offline while another tab is still connected.
function roomKey(room: string) {
  return `presence:${room}`;
}

export async function markPresent(room: string, userId: string, socketId: string) {
  await redis.hset(roomKey(room), `${userId}:${socketId}`, Date.now().toString());
}

export async function markAbsent(room: string, userId: string, socketId: string) {
  await redis.hdel(roomKey(room), `${userId}:${socketId}`);
}

export async function listPresentUserIds(room: string): Promise<string[]> {
  const entries = await redis.hkeys(roomKey(room));
  const userIds = new Set(entries.map((entry) => entry.split(':')[0]));
  return Array.from(userIds);
}
