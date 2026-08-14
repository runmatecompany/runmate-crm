import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "./api";
import { getApiUrl } from "./serverConfig";

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

export function roomDisplayName(room: RoomSummary): string {
  if (room.is_dm) return room.other_user_name ?? "Ismeretlen";
  return room.name ?? "Névtelen szoba";
}

export function useChatSocket(token: string | null, onMessage: (message: ChatMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const wsUrl = `${getApiUrl().replace(/^http/, "ws")}/chat/ws?token=${encodeURIComponent(token as string)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (frame.type === "message") {
            onMessageRef.current(frame.message);
          }
        } catch {
          // hibás keret, kihagyjuk
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [token]);

  const sendMessage = useCallback((roomId: number, body: string) => {
    wsRef.current?.send(JSON.stringify({ type: "message", roomId, body }));
  }, []);

  return { connected, sendMessage };
}
