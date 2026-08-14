import { roomDisplayName, type RoomSummary } from "../../lib/chat";

interface RoomListProps {
  rooms: RoomSummary[];
  activeRoomId: number | null;
  onSelect: (roomId: number) => void;
  isAdmin: boolean;
  onCreateRoom: () => void;
  onNewDm: () => void;
}

export default function RoomList({ rooms, activeRoomId, onSelect, isAdmin, onCreateRoom, onNewDm }: RoomListProps) {
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
          <span className="chat-room-name">{roomDisplayName(room)}</span>
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
        <button
          key={room.id}
          type="button"
          className={room.id === activeRoomId ? "chat-room-item active" : "chat-room-item"}
          onClick={() => onSelect(room.id)}
        >
          <span className="chat-room-name">{roomDisplayName(room)}</span>
          {room.last_message_body && <span className="chat-room-preview">{room.last_message_body}</span>}
        </button>
      ))}
    </aside>
  );
}
