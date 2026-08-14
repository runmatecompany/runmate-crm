// Kis absztrakció a nyers WebSocket felett, hogy ne kelljen a 'ws' csomag
// típusaitól közvetlenül függenünk.
interface ChatSocket {
  send(data: string): void;
  readyState: number;
}

const OPEN = 1;

const connections = new Map<number, Set<ChatSocket>>();

// Igaz visszatérési érték = ez volt a felhasználó első aktív kapcsolata
// (tehát az imént lett offline-ból online).
export function registerConnection(userId: number, socket: ChatSocket): boolean {
  const wasOffline = !connections.has(userId) || connections.get(userId)!.size === 0;
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId)!.add(socket);
  return wasOffline;
}

// Igaz visszatérési érték = a felhasználónak nem maradt több aktív
// kapcsolata (tehát most lett offline).
export function unregisterConnection(userId: number, socket: ChatSocket): boolean {
  connections.get(userId)?.delete(socket);
  if (connections.get(userId)?.size === 0) {
    connections.delete(userId);
    return true;
  }
  return false;
}

export function isUserOnline(userId: number): boolean {
  return (connections.get(userId)?.size ?? 0) > 0;
}

export function getOnlineUserIds(): number[] {
  return Array.from(connections.keys());
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
