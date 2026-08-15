// Hívás-állapot: melyik szobában ki van bent, melyik socket-je alapján.
// Szándékosan efemer (memóriában él, mint a connections.ts presence-map) —
// egy szerver-újraindítás természetesen véget vet minden hívásnak.
interface ChatSocket {
  send(data: string): void;
  readyState: number;
}

export interface CallParticipant {
  userId: number;
  sharingScreen: boolean;
}

interface InternalParticipant extends CallParticipant {
  socket: ChatSocket;
}

export const MAX_PARTICIPANTS_PER_CALL = 6;

// roomId -> userId -> résztvevő (a socket-tel együtt, hogy multi-tab esetén
// tudjuk, melyik konkrét kapcsolat "birtokolja" a tagságot).
const activeCalls = new Map<number, Map<number, InternalParticipant>>();

export function getParticipants(roomId: number): CallParticipant[] {
  const room = activeCalls.get(roomId);
  if (!room) return [];
  return Array.from(room.values()).map(({ userId, sharingScreen }) => ({ userId, sharingScreen }));
}

export function getAllActiveCalls(): Map<number, CallParticipant[]> {
  const out = new Map<number, CallParticipant[]>();
  for (const roomId of activeCalls.keys()) {
    out.set(roomId, getParticipants(roomId));
  }
  return out;
}

export type JoinResult =
  | { ok: true; existing: CallParticipant[] }
  | { ok: false; reason: "already-in-call" | "call-full" };

export function joinCall(roomId: number, userId: number, socket: ChatSocket): JoinResult {
  if (!activeCalls.has(roomId)) {
    activeCalls.set(roomId, new Map());
  }
  const room = activeCalls.get(roomId)!;

  const current = room.get(userId);
  if (current && current.socket !== socket) {
    // A felhasználó egy másik tabja/kapcsolata már bent van a hívásban.
    return { ok: false, reason: "already-in-call" };
  }
  if (!current && room.size >= MAX_PARTICIPANTS_PER_CALL) {
    return { ok: false, reason: "call-full" };
  }

  const existing = Array.from(room.values())
    .filter((p) => p.userId !== userId)
    .map(({ userId, sharingScreen }) => ({ userId, sharingScreen }));

  room.set(userId, { userId, socket, sharingScreen: current?.sharingScreen ?? false });
  return { ok: true, existing };
}

export function leaveCall(roomId: number, userId: number, socket?: ChatSocket): boolean {
  const room = activeCalls.get(roomId);
  const current = room?.get(userId);
  if (!room || !current) return false;
  if (socket && current.socket !== socket) return false; // elavult/lecserélt socket — figyelmen kívül hagyjuk
  room.delete(userId);
  if (room.size === 0) activeCalls.delete(roomId);
  return true;
}

export function setScreenSharing(roomId: number, userId: number, sharing: boolean): boolean {
  const participant = activeCalls.get(roomId)?.get(userId);
  if (!participant) return false;
  participant.sharingScreen = sharing;
  return true;
}

// A WS 'close' handlerből hívva. Visszaadja azoknak a szobáknak az id-jét,
// amikben ez a socket bent volt, hogy a hívó tudjon roster-frissítést küldeni.
export function leaveAllCallsForSocket(socket: ChatSocket): number[] {
  const affectedRoomIds: number[] = [];
  for (const [roomId, room] of activeCalls.entries()) {
    for (const [userId, participant] of room.entries()) {
      if (participant.socket === socket) {
        room.delete(userId);
        affectedRoomIds.push(roomId);
      }
    }
    if (room.size === 0) activeCalls.delete(roomId);
  }
  return affectedRoomIds;
}
