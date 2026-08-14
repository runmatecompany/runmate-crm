import { useState, type FormEvent } from "react";
import type { Colleague } from "../../lib/chat";

interface CreateRoomModalProps {
  colleagues: Colleague[];
  onClose: () => void;
  onCreate: (name: string, memberIds: number[]) => void;
}

export default function CreateRoomModal({ colleagues, onClose, onCreate }: CreateRoomModalProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), Array.from(selected));
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <form className="chat-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Új szoba létrehozása</h2>
        <label htmlFor="room-name">Szoba neve</label>
        <input id="room-name" value={name} onChange={(e) => setName(e.currentTarget.value)} required autoFocus />

        <label>Tagok</label>
        <div className="chat-member-picker">
          {colleagues.map((c) => (
            <label key={c.id} className="chat-member-option">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              {c.name} <span className="chat-member-email">({c.email})</span>
            </label>
          ))}
        </div>

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose}>
            Mégse
          </button>
          <button type="submit">Létrehozás</button>
        </div>
      </form>
    </div>
  );
}
