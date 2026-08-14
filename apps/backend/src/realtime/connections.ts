// Kis absztrakció a nyers WebSocket felett, hogy ne kelljen a 'ws' csomag
// típusaitól közvetlenül függenünk.
interface ChatSocket {
  send(data: string): void;
  readyState: number;
}

const OPEN = 1;

const connections = new Map<number, Set<ChatSocket>>();

export function registerConnection(userId: number, socket: ChatSocket): void {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId)!.add(socket);
}

export function unregisterConnection(userId: number, socket: ChatSocket): void {
  connections.get(userId)?.delete(socket);
  if (connections.get(userId)?.size === 0) {
    connections.delete(userId);
  }
}

export function sendToUser(userId: number, payload: unknown): void {
  const sockets = connections.get(userId);
  if (!sockets) return;
  const data = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === OPEN) {
      socket.send(data);
    }
  }
}

export function broadcastToUsers(userIds: number[], payload: unknown): void {
  for (const userId of userIds) {
    sendToUser(userId, payload);
  }
}

export function broadcastToAll(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const sockets of connections.values()) {
    for (const socket of sockets) {
      if (socket.readyState === OPEN) {
        socket.send(data);
      }
    }
  }
}
