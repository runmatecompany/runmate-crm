import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { authFetch } from "./api";
import { getApiUrl } from "./serverConfig";
import { getUnreadCount, type ChatMessage } from "./chat";

interface RealtimeValue {
  connected: boolean;
  sendFrame: (frame: Record<string, unknown>) => void;
  onFrame: (type: string, callback: (frame: any) => void) => () => void;
  sendChatMessage: (roomId: number, body: string) => void;
  onChatMessage: (callback: (message: ChatMessage) => void) => () => void;
  avatarVersions: Record<number, number>;
  names: Record<number, string>;
  bumpAvatar: (userId: number) => void;
  onlineUserIds: Set<number>;
  unreadCount: number;
  refreshUnreadCount: () => void;
}

const RealtimeContext = createContext<RealtimeValue | undefined>(undefined);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const wsRef = useRef<WebSocket | null>(null);
  const frameListenersRef = useRef<Map<string, Set<(frame: any) => void>>>(new Map());
  const [connected, setConnected] = useState(false);
  const [avatarVersions, setAvatarVersions] = useState<Record<number, number>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);

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
        authFetch(token as string, "/chat/presence")
          .then((res) => res.json())
          .then((data) => {
            if (!cancelled) setOnlineUserIds(new Set<number>(data.onlineUserIds ?? []));
          })
          .catch(() => {});
        getUnreadCount(token as string)
          .then((count) => {
            if (!cancelled) setUnreadCount(count);
          })
          .catch(() => {});
      };
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onmessage = (event) => {
        let frame: any;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!frame?.type) return;

        if (frame.type === "profile-updated") {
          if (frame.avatarChanged) {
            setAvatarVersions((prev) => ({ ...prev, [frame.userId]: (prev[frame.userId] ?? 0) + 1 }));
          }
          if (frame.name) {
            setNames((prev) => ({ ...prev, [frame.userId]: frame.name as string }));
          }
        }

        if (frame.type === "presence-changed") {
          setOnlineUserIds((prev) => {
            const next = new Set(prev);
            if (frame.online) next.add(frame.userId);
            else next.delete(frame.userId);
            return next;
          });
        }

        // Bármelyik oldalon vagyunk épp az appban, minden hozzánk beérkező
        // üzenetet automatikusan kézbesítettnek igazolunk vissza.
        if (frame.type === "message" && frame.message?.sender_id !== auth?.user.id) {
          ws.send(
            JSON.stringify({ type: "delivered", messageId: frame.message.id, roomId: frame.message.room_id })
          );
          // Optimista növelés — ha épp az adott szobát nézzük, a ChatPage
          // úgyis azonnal elolvasottnak jelöli és refreshUnreadCount()-tal
          // korrigál, itt nem tudjuk (és nem is kell) ezt megkülönböztetni.
          setUnreadCount((prev) => prev + 1);
        }

        frameListenersRef.current.get(frame.type)?.forEach((cb) => cb(frame));
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [token]);

  const sendFrame = useCallback((frame: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify(frame));
  }, []);

  const onFrame = useCallback((type: string, callback: (frame: any) => void) => {
    if (!frameListenersRef.current.has(type)) {
      frameListenersRef.current.set(type, new Set());
    }
    frameListenersRef.current.get(type)!.add(callback);
    return () => {
      frameListenersRef.current.get(type)?.delete(callback);
    };
  }, []);

  const sendChatMessage = useCallback(
    (roomId: number, body: string) => sendFrame({ type: "message", roomId, body }),
    [sendFrame]
  );

  const onChatMessage = useCallback(
    (callback: (message: ChatMessage) => void) => onFrame("message", (frame) => callback(frame.message)),
    [onFrame]
  );

  const bumpAvatar = useCallback((userId: number) => {
    setAvatarVersions((prev) => ({ ...prev, [userId]: (prev[userId] ?? 0) + 1 }));
  }, []);

  // A ChatPage minden alkalommal meghívja, amikor egy szobát olvasottnak
  // jelöl (megnyitáskor, vagy új üzenetnél ha épp az a szoba aktív) — a
  // pontos szám a szerverről jön vissza, nem próbálunk helyi számolással
  // szinkronban maradni azzal, hány üzenet lett épp elolvasva.
  const refreshUnreadCount = useCallback(() => {
    if (!token) return;
    getUnreadCount(token).then(setUnreadCount).catch(() => {});
  }, [token]);

  return (
    <RealtimeContext.Provider
      value={{
        connected,
        sendFrame,
        onFrame,
        sendChatMessage,
        onChatMessage,
        avatarVersions,
        names,
        bumpAvatar,
        onlineUserIds,
        unreadCount,
        refreshUnreadCount,
      }}
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
