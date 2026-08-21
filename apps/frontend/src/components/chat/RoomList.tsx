import { roomDisplayName, type RoomSummary } from "../../lib/chat";
import { useRealtime } from "../../lib/realtime";
import { useCall } from "../../lib/call";
import Avatar from "../Avatar";

interface RoomListProps {
  rooms: RoomSummary[];
  activeRoomId: number | null;
  onSelect: (roomId: number) => void;
  isAdmin: boolean;
  onCreateRoom: () => void;
  onNewDm: () => void;
}

function CallBadge({ roomId }: { roomId: number }) {
  const { roomRosters } = useCall();
  const participants = roomRosters.get(roomId);
  if (!participants || participants.length === 0) return null;
  return (
    <span
      className="room-call-badge"
      title={`Hívásban: ${participants.map((p) => p.name).join(", ")}`}
    >
      🔊 {participants.length}
    </span>
  );
}

export default function RoomList({ rooms, activeRoomId, onSelect, isAdmin, onCreateRoom, onNewDm }: RoomListProps) {
  const { names } = useRealtime();
  const groupRooms = rooms.filter((r) => !r.is_dm);
  const dmRooms = rooms.filter((r) => r.is_dm);

  return (
    <aside className="chat-room-list">
      <div className="chat-room-list-header">
        <span>Szobák</span>
        {isAdmin && (
          <button type="button" className="chat-icon-btn" onClick={onCreateRoom} title="Új szoba">
            +
          </button>
        )}
      </div>
      {groupRooms.length === 0 && <p className="chat-empty-hint">Nincs még csoportszoba.</p>}
      {groupRooms.map((room) => (
        <button
          key={room.id}
          type="button"
          className={room.id === activeRoomId ? "chat-room-item active" : "chat-room-item"}
          onClick={() => onSelect(room.id)}
        >
          <span className="chat-room-item-row">
            <span className="chat-room-name">{roomDisplayName(room, names)}</span>
            <CallBadge roomId={room.id} />
          </span>
          {room.last_message_body && <span className="chat-room-preview">{room.last_message_body}</span>}
        </button>
      ))}

      <div className="chat-room-list-header">
        <span>Privát üzenetek</span>
        <button type="button" className="chat-icon-btn" onClick={onNewDm} title="Új privát üzenet">
          +
        </button>
      </div>
      {dmRooms.length === 0 && <p className="chat-empty-hint">Nincs még privát beszélgetés.</p>}
      {dmRooms.map((room) => (
        <div
          key={room.id}
          role="button"
          tabIndex={0}
          className={room.id === activeRoomId ? "chat-room-item active" : "chat-room-item"}
          onClick={() => onSelect(room.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(room.id);
            }
          }}
        >
          <span className="chat-room-item-row">
            {room.other_user_id != null && (
              <Avatar userId={room.other_user_id} name={room.other_user_name ?? "?"} size={22} />
            )}
            <span className="chat-room-name">{roomDisplayName(room, names)}</span>
            <CallBadge roomId={room.id} />
          </span>
          {room.last_message_body && <span className="chat-room-preview">{room.last_message_body}</span>}
        </div>
      ))}
    </aside>
  );
}
