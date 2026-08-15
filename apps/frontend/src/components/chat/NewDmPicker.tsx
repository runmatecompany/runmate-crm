import type { Colleague } from "../../lib/chat";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface NewDmPickerProps {
  colleagues: Colleague[];
  onClose: () => void;
  onPick: (userId: number) => void;
}

export default function NewDmPicker({ colleagues, onClose, onPick }: NewDmPickerProps) {
  useEscapeToClose(onClose);
  return (
    <div className="chat-modal-backdrop">
      <div className="chat-modal">
        <h2>Privát üzenet indítása</h2>
        <div className="chat-member-picker">
          {colleagues.length === 0 && <p className="chat-empty-hint">Nincs más kolléga még.</p>}
          {colleagues.map((c) => (
            <button key={c.id} type="button" className="chat-colleague-pick" onClick={() => onPick(c.id)}>
              {c.name} <span className="chat-member-email">({c.email})</span>
            </button>
          ))}
        </div>
        <div className="chat-modal-actions">
          <button type="button" onClick={onClose}>
            Bezár
          </button>
        </div>
      </div>
    </div>
  );
}
