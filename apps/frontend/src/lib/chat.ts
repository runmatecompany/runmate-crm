import { authFetch } from "./api";

export interface RoomSummary {
  id: number;
  name: string | null;
  is_dm: boolean;
  other_user_id: number | null;
  other_user_name: string | null;
  last_message_body: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  room_id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface Colleague {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
}

export async function listRooms(token: string): Promise<RoomSummary[]> {
  const res = await authFetch(token, "/chat/rooms");
  const data = await res.json();
  return data.rooms;
}

export async function listColleagues(token: string): Promise<Colleague[]> {
  const res = await authFetch(token, "/chat/users");
  const data = await res.json();
  return data.users;
}

export async function listMessages(token: string, roomId: number): Promise<ChatMessage[]> {
  const res = await authFetch(token, `/chat/rooms/${roomId}/messages`);
  const data = await res.json();
  return data.messages;
}

export async function startDm(token: string, userId: number): Promise<number> {
  const res = await authFetch(token, `/chat/dm/${userId}`, { method: "POST" });
  const data = await res.json();
  return data.roomId;
}

export async function createRoom(token: string, name: string, memberIds: number[]): Promise<RoomSummary> {
  const res = await authFetch(token, "/admin/chat/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, memberIds }),
  });
  const data = await res.json();
  return data.room;
}

// A `liveNames` az aktuálisan ismert, valós idejű névfrissítéseket tartalmazza
// (lásd lib/realtime.tsx) — ha van benne friss adat a másik félre, azt
// részesítjük előnyben a szoba lekérésekor kapott (esetleg elavult) névvel szemben.
export function roomDisplayName(room: RoomSummary, liveNames?: Record<number, string>): string {
  if (room.is_dm) {
    const live = room.other_user_id != null ? liveNames?.[room.other_user_id] : undefined;
    return live ?? room.other_user_name ?? "Ismeretlen";
  }
  return room.name ?? "Névtelen szoba";
}
