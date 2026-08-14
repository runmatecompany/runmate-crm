import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { useRealtime } from "../lib/realtime";
import { useCall } from "../lib/call";
import { useNavigation } from "../lib/navigation";
import {
  createRoom,
  listColleagues,
  listMessages,
  listRooms,
  roomDisplayName,
  startDm,
  type ChatMessage,
  type Colleague,
  type RoomSummary,
} from "../lib/chat";
import RoomList from "../components/chat/RoomList";
import MessageThread from "../components/chat/MessageThread";
import CreateRoomModal from "../components/chat/CreateRoomModal";
import NewDmPicker from "../components/chat/NewDmPicker";
import Avatar from "../components/Avatar";

const TYPING_THROTTLE_MS = 2000;
const TYPING_EXPIRE_MS = 3000;

export default function ChatPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";
  const { onChatMessage, sendChatMessage, sendFrame, onFrame, names } = useRealtime();
  const { status: callStatus, startCall } = useCall();
  const { requestedRoomId, clearRequestedRoom, setViewingRoomId } = useNavigation();

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [typingUserId, setTypingUserId] = useState<number | null>(null);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const refreshRooms = useCallback(async () => {
    if (!token) return;
    setRooms(await listRooms(token));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refreshRooms();
    listColleagues(token).then(setColleagues);
  }, [token, refreshRooms]);

  useEffect(() => {
    setTypingUserId(null);
    if (!token || activeRoomId == null) {
      setMessages([]);
      return;
    }
    listMessages(token, activeRoomId).then((msgs) => {
      setMessages(msgs);
      sendFrame({ type: "read-room", roomId: activeRoomId });
    });
  }, [token, activeRoomId, sendFrame]);

  // Ha egy toast értesítésre kattintva kértek megnyitni egy szobát, azt
  // választjuk aktívvá.
  useEffect(() => {
    if (requestedRoomId != null) {
      setActiveRoomId(requestedRoomId);
      clearRequestedRoom();
    }
  }, [requestedRoomId, clearRequestedRoom]);

  // Jelezzük app-szinten, melyik szobát nézzük épp — így ehhez a szobához
  // nem jelenik meg felesleges toast.
  useEffect(() => {
    setViewingRoomId(activeRoomId);
    return () => setViewingRoomId(null);
  }, [activeRoomId, setViewingRoomId]);

  useEffect(() => {
    return onChatMessage((message: ChatMessage) => {
      setRooms((prev) => {
        const next = prev.map((r) =>
          r.id === message.room_id
            ? { ...r, last_message_body: message.body, last_message_at: message.created_at }
            : r
        );
        return [...next].sort((a, b) => {
          const at = a.last_message_at ?? a.created_at;
          const bt = b.last_message_at ?? b.created_at;
          return new Date(bt).getTime() - new Date(at).getTime();
        });
      });
      if (message.room_id === activeRoomId) {
        setMessages((prev) => [...prev, message]);
        if (message.sender_id !== auth?.user.id) {
          sendFrame({ type: "read-room", roomId: activeRoomId });
        }
      }
    });
  }, [onChatMessage, activeRoomId, auth, sendFrame]);

  useEffect(() => {
    return onFrame("typing", (frame) => {
      if (frame.roomId !== activeRoomId || frame.fromUserId === auth?.user.id) return;
      setTypingUserId(frame.fromUserId);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUserId(null), TYPING_EXPIRE_MS);
    });
  }, [onFrame, activeRoomId, auth]);

  useEffect(() => {
    const offReceipt = onFrame("receipt", (frame) => {
      const now = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === frame.messageId
            ? {
                ...m,
                delivered_at: frame.delivered ? (m.delivered_at ?? now) : m.delivered_at,
                read_at: frame.read ? now : m.read_at,
              }
            : m
        )
      );
    });
    const offBulk = onFrame("receipts-bulk", (frame) => {
      if (frame.roomId !== activeRoomId) return;
      const now = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id === auth?.user.id ? { ...m, delivered_at: m.delivered_at ?? now, read_at: m.read_at ?? now } : m
        )
      );
    });
    return () => {
      offReceipt();
      offBulk();
    };
  }, [onFrame, activeRoomId, auth]);

  function handleDraftChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.currentTarget.value;
    setDraft(value);
    if (activeRoomId == null) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > TYPING_THROTTLE_MS) {
      sendFrame({ type: "typing", roomId: activeRoomId });
      lastTypingSentRef.current = now;
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || activeRoomId == null) return;
    sendChatMessage(activeRoomId, draft.trim());
    setDraft("");
  }

  async function handleCreateRoom(name: string) {
    if (!token) return;
    const room = await createRoom(token, name);
    setShowCreateRoom(false);
    await refreshRooms();
    setActiveRoomId(room.id);
  }

  async function handleNewDm(userId: number) {
    if (!token) return;
    const roomId = await startDm(token, userId);
    setShowNewDm(false);
    await refreshRooms();
    setActiveRoomId(roomId);
  }

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
  const typingColleague = colleagues.find((c) => c.id === typingUserId);
  const typingUserName =
    typingUserId != null ? (names[typingUserId] ?? typingColleague?.name ?? "Valaki") : null;

  return (
    <div className="chat-page">
      <RoomList
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelect={setActiveRoomId}
        isAdmin={isAdmin}
        onCreateRoom={() => setShowCreateRoom(true)}
        onNewDm={() => setShowNewDm(true)}
      />

      <div className="chat-main">
        {activeRoom ? (
          <>
            <div className="chat-main-header">
              {activeRoom.is_dm && activeRoom.other_user_id != null && (
                <Avatar
                  userId={activeRoom.other_user_id}
                  name={activeRoom.other_user_name ?? "?"}
                  size={30}
                />
              )}
              <span>{roomDisplayName(activeRoom, names)}</span>
              {activeRoom.is_dm && activeRoom.other_user_id != null && (
                <button
                  type="button"
                  className="chat-call-btn"
                  disabled={callStatus !== "idle"}
                  onClick={() =>
                    startCall(
                      activeRoom.id,
                      activeRoom.other_user_id as number,
                      names[activeRoom.other_user_id as number] ?? activeRoom.other_user_name ?? "?"
                    )
                  }
                >
                  Hívás indítása
                </button>
              )}
            </div>
            <MessageThread messages={messages} currentUserId={auth?.user.id ?? -1} />
            {typingUserName && <div className="chat-typing-indicator">{typingUserName} éppen ír...</div>}
            <form className="chat-input-row" onSubmit={handleSend}>
              <input value={draft} onChange={handleDraftChange} placeholder="Írj üzenetet..." />
              <button type="submit">Küldés</button>
            </form>
          </>
        ) : (
          <div className="chat-empty-state">Válassz egy szobát, vagy indíts egy új beszélgetést.</div>
        )}
      </div>

      {showCreateRoom && (
        <CreateRoomModal onClose={() => setShowCreateRoom(false)} onCreate={handleCreateRoom} />
      )}
      {showNewDm && (
        <NewDmPicker
          colleagues={colleagues.filter((c) => c.id !== auth?.user.id)}
          onClose={() => setShowNewDm(false)}
          onPick={handleNewDm}
        />
      )}
    </div>
  );
}
