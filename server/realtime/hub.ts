// In-memory pub/sub from topics to sockets. Topics: channel:{id} and user:{id}.
// Best-effort by design (§5.1): the database is authoritative, and clients
// refetch after reconnecting. A multi-instance deployment would put Redis
// pub/sub or Postgres LISTEN/NOTIFY behind this same interface.
import type { WebSocket } from 'ws';
import type { ServerEvent } from '../../shared/types.js';

const topics = new Map<string, Set<WebSocket>>();

export function subscribe(socket: WebSocket, topicNames: string[]) {
  for (const topic of topicNames) {
    let sockets = topics.get(topic);
    if (!sockets) topics.set(topic, (sockets = new Set()));
    sockets.add(socket);
  }
  socket.on('close', () => {
    for (const topic of topicNames) {
      const sockets = topics.get(topic);
      sockets?.delete(socket);
      if (sockets?.size === 0) topics.delete(topic);
    }
  });
}

export function publish(topic: string, event: ServerEvent) {
  const sockets = topics.get(topic);
  if (!sockets) return;
  const data = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(data);
  }
}

export const channelTopic = (channelId: string) => `channel:${channelId}`;
export const userTopic = (userId: string) => `user:${userId}`;
