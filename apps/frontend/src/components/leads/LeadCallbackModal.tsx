import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface LeadCallbackModalProps {
  companyName: string;
  onClose: () => void;
  onSave: (dueDate: string, note: string) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// "Visszahívandó" állapotra váltáskor azonnal rákérdez, mikor kell
// visszahívni — ez a dátum kerül bele a Feladatok modulba automatikusan
// létrehozott emlékeztető feladat határidejeként (lásd LeadsPage.tsx
// handleSaveCallback), hogy ne kelljen külön, kézzel felvenni.
export default function LeadCallbackModal({ companyName, onClose, onSave }: LeadCallbackModalProps) {
  useEscapeToClose(onClose);
  const [dueDate, setDueDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dueDate) {
      setError("Add meg, mikor kell visszahívni.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(dueDate, note.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{companyName} — Visszahívandó</h2>
        <p className="chat-empty-hint">
          Mikor kell visszahívni? Ebből automatikusan létrejön egy emlékeztető feladat a Feladatok modulban.
        </p>

        <label htmlFor="callback-date">Visszahívás dátuma</label>
        <input
          id="callback-date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.currentTarget.value)}
          autoFocus
          required
        />

        <label htmlFor="callback-note">Jegyzet (nem kötelező)</label>
        <textarea
          id="callback-note"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="Pl. mit ígértél, mit kell tudni a hívás előtt"
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
