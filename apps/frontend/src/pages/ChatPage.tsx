import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { useRealtime } from "../lib/realtime";
import { useCall } from "../lib/call";
import { useNavigation } from "../lib/navigation";
import {
  clearRoom,
  createRoom,
  listColleagues,
  listMessages,
  listRooms,
  restoreRoom,
  roomDisplayName,
  sendChatImage,
  startDm,
  type ChatMessage,
  type Colleague,
  type RoomSummary,
} from "../lib/chat";
import { resizeImageToDataUrl } from "../lib/profile";
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
  const { onChatMessage, sendChatMessage, sendFrame, onFrame, names, refreshUnreadCount } = useRealtime();
  const { status: callStatus, roomId: callRoomId, roomRosters, joinCall } = useCall();
  const { requestedRoomId, clearRequestedRoom, setViewingRoomId } = useNavigation();

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [typingUserId, setTypingUserId] = useState<number | null>(null);
  const [sendingImage, setSendingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
      // Kis késleltetés, hogy a szerver a WS "read-room" keretet a
      // számláló friss lekérdezése előtt biztosan feldolgozza — a HTTP és
      // a WS-kapcsolat sorrendje egyébként nem garantált.
      setTimeout(refreshUnreadCount, 300);
    });
  }, [token, activeRoomId, sendFrame, refreshUnreadCount]);

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
          setTimeout(refreshUnreadCount, 300);
        }
      }
    });
  }, [onChatMessage, activeRoomId, auth, sendFrame, refreshUnreadCount]);

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

  // A /clear és /restore parancsok másik kliensen (vagy más nézetben) futtatva
  // is azonnal frissítsék az aktuálisan nyitott beszélgetést.
  useEffect(() => {
    const offCleared = onFrame("room-cleared", (frame) => {
      if (frame.roomId === activeRoomId) setMessages([]);
    });
    const offRestored = onFrame("room-restored", (frame) => {
      if (activeRoomId != null && frame.roomId === activeRoomId && token) {
        listMessages(token, activeRoomId).then(setMessages);
      }
    });
    return () => {
      offCleared();
      offRestored();
    };
  }, [onFrame, activeRoomId, token]);

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

  async function handleClearCommand(roomId: number) {
    if (!token) return;
    if (
      !confirm(
        "Biztosan törlöd ennek a beszélgetésnek az előzményeit? A nézetből eltűnik mindenkinél, de admin a /restore paranccsal vissza tudja állítani."
      )
    ) {
      return;
    }
    try {
      await clearRoom(token, roomId);
      setMessages([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült törölni az előzményeket");
    }
  }

  async function handleRestoreCommand(roomId: number) {
    if (!token) return;
    try {
      await restoreRoom(token, roomId);
      setMessages(await listMessages(token, roomId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült visszaállítani az előzményeket");
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || activeRoomId == null) return;
    const trimmed = draft.trim();

    if (trimmed.startsWith("/")) {
      setDraft("");
      const command = trimmed.toLowerCase();
      if (command === "/clear") {
        void handleClearCommand(activeRoomId);
      } else if (command === "/restore") {
        void handleRestoreCommand(activeRoomId);
      } else {
        alert(`Ismeretlen parancs: ${trimmed}`);
      }
      return;
    }

    sendChatMessage(activeRoomId, trimmed);
    setDraft("");
  }

  async function sendImageFile(file: File) {
    if (!token || activeRoomId == null) return;
    setSendingImage(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 1600, 0.82);
      await sendChatImage(token, activeRoomId, dataUrl, draft.trim() || undefined);
      setDraft("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült elküldeni a képet");
    } finally {
      setSendingImage(false);
    }
  }

  async function handleImageSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    await sendImageFile(file);
  }

  // A Tauri ablak dragDropEnabled beállítása false — enélkül a natív
  // ablak-réteg elkapná a fájl-dobást, mielőtt a webview HTML5 drag/drop
  // eseményei egyáltalán lefutnának (ugyanaz a minta, mint a Drive-
  // böngészőnél).
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (activeRoomId == null) return;
    setIsDraggingOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    if (activeRoomId == null) return;
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    void sendImageFile(file);
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

  function handleJoinCall(room: RoomSummary) {
    const otherName = room.other_user_id != null ? (names[room.other_user_id] ?? room.other_user_name) : undefined;
    joinCall(room.id, room.is_dm, room.other_user_id ?? undefined, otherName ?? undefined);
  }

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
  const activeRoomRoster = activeRoom ? (roomRosters.get(activeRoom.id) ?? []) : [];
  const inActiveRoomCall = callStatus === "connected" && activeRoom != null && callRoomId === activeRoom.id;
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

      <div
        className={`chat-main${isDraggingOver ? " chat-main-dragover" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingOver && <div className="chat-dropzone-hint">Engedd el a képet a küldéshez</div>}
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
              {!inActiveRoomCall && activeRoomRoster.length === 0 && (
                <button
                  type="button"
                  className="chat-call-btn"
                  disabled={callStatus !== "idle"}
                  onClick={() => handleJoinCall(activeRoom)}
                >
                  Hívás indítása
                </button>
              )}
              {!inActiveRoomCall && activeRoomRoster.length > 0 && (
                <button
                  type="button"
                  className="chat-call-btn chat-call-join-btn"
                  disabled={callStatus !== "idle"}
                  onClick={() => handleJoinCall(activeRoom)}
                >
                  🔊 {activeRoomRoster.length} fő hívásban — Csatlakozás
                </button>
              )}
            </div>
            <MessageThread messages={messages} currentUserId={auth?.user.id ?? -1} />
            {typingUserName && <div className="chat-typing-indicator">{typingUserName} éppen ír...</div>}
            <form className="chat-input-row" onSubmit={handleSend}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="chat-image-input"
                onChange={handleImageSelected}
              />
              <button
                type="button"
                className="chat-image-btn"
                title="Kép küldése"
                disabled={sendingImage}
                onClick={() => imageInputRef.current?.click()}
              >
                {sendingImage ? "..." : "📷"}
              </button>
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
