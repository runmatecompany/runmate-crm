import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface CreateRoomModalProps {
  onClose: () => void;
  onCreate: (name: string) => void;
}

export default function CreateRoomModal({ onClose, onCreate }: CreateRoomModalProps) {
  const [name, setName] = useState("");
  useEscapeToClose(onClose);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal" onSubmit={handleSubmit}>
        <h2>Új szoba létrehozása</h2>
        <p className="chat-modal-hint">Ezt a szobát minden kolléga automatikusan látni fogja.</p>
        <label htmlFor="room-name">Szoba neve</label>
        <input id="room-name" value={name} onChange={(e) => setName(e.currentTarget.value)} required autoFocus />

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
