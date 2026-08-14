import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { useRealtime } from "../lib/realtime";
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

export default function ChatPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";
  const { onChatMessage, sendChatMessage, names } = useRealtime();

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);

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
    if (!token || activeRoomId == null) {
      setMessages([]);
      return;
    }
    listMessages(token, activeRoomId).then(setMessages);
  }, [token, activeRoomId]);

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
      setMessages((prev) => (message.room_id === activeRoomId ? [...prev, message] : prev));
    });
  }, [onChatMessage, activeRoomId]);

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || activeRoomId == null) return;
    sendChatMessage(activeRoomId, draft.trim());
    setDraft("");
  }

  async function handleCreateRoom(name: string, memberIds: number[]) {
    if (!token) return;
    const room = await createRoom(token, name, memberIds);
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
            </div>
            <MessageThread messages={messages} currentUserId={auth?.user.id ?? -1} />
            <form className="chat-input-row" onSubmit={handleSend}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                placeholder="Írj üzenetet..."
              />
              <button type="submit">Küldés</button>
            </form>
          </>
        ) : (
          <div className="chat-empty-state">Válassz egy szobát, vagy indíts egy új beszélgetést.</div>
        )}
      </div>

      {showCreateRoom && (
        <CreateRoomModal
          colleagues={colleagues}
          onClose={() => setShowCreateRoom(false)}
          onCreate={handleCreateRoom}
        />
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
