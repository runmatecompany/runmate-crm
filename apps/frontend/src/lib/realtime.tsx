import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { getApiUrl } from "./serverConfig";
import type { ChatMessage } from "./chat";

interface ProfileUpdatedFrame {
  type: "profile-updated";
  userId: number;
  name?: string;
  avatarChanged?: boolean;
}

interface MessageFrame {
  type: "message";
  message: ChatMessage;
}

type IncomingFrame = ProfileUpdatedFrame | MessageFrame;

interface RealtimeValue {
  connected: boolean;
  sendChatMessage: (roomId: number, body: string) => void;
  onChatMessage: (callback: (message: ChatMessage) => void) => () => void;
  avatarVersions: Record<number, number>;
  names: Record<number, string>;
  bumpAvatar: (userId: number) => void;
}

const RealtimeContext = createContext<RealtimeValue | undefined>(undefined);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<(message: ChatMessage) => void>>(new Set());
  const [connected, setConnected] = useState(false);
  const [avatarVersions, setAvatarVersions] = useState<Record<number, number>>({});
  const [names, setNames] = useState<Record<number, string>>({});

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
        let frame: IncomingFrame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }

        if (frame.type === "message") {
          listenersRef.current.forEach((cb) => cb(frame.message));
        } else if (frame.type === "profile-updated") {
          if (frame.avatarChanged) {
            setAvatarVersions((prev) => ({ ...prev, [frame.userId]: (prev[frame.userId] ?? 0) + 1 }));
          }
          if (frame.name) {
            setNames((prev) => ({ ...prev, [frame.userId]: frame.name as string }));
          }
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

  const sendChatMessage = useCallback((roomId: number, body: string) => {
    wsRef.current?.send(JSON.stringify({ type: "message", roomId, body }));
  }, []);

  const onChatMessage = useCallback((callback: (message: ChatMessage) => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  const bumpAvatar = useCallback((userId: number) => {
    setAvatarVersions((prev) => ({ ...prev, [userId]: (prev[userId] ?? 0) + 1 }));
  }, []);

  return (
    <RealtimeContext.Provider
      value={{ connected, sendChatMessage, onChatMessage, avatarVersions, names, bumpAvatar }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return ctx;
}
