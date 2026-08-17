import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface LeadInterestedNoteModalProps {
  companyName: string;
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
}

// A hívás közbeni jegyzeteléshez — nagyobb, kényelmesen írható mező, nem
// egy sorba szorított prompt(). A jegyzet kötelező (lásd routes/leads.ts
// szerver-oldali ellenőrzését is), amíg üres, nem menthető.
export default function LeadInterestedNoteModal({ companyName, onClose, onSave }: LeadInterestedNoteModalProps) {
  useEscapeToClose(onClose);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      setError("A jegyzet kitöltése kötelező.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(note.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{companyName} — Érdekli</h2>
        <p className="chat-empty-hint">Jegyzetelj hívás közben — mi derült ki, mit ígértél, mikor kell visszahívni.</p>

        <label htmlFor="interested-note">Jegyzet</label>
        <textarea
          id="interested-note"
          rows={8}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="Pl. érdekli az Instagram-csomag, árajánlatot kér, hívjuk vissza csütörtökön 10-kor"
          autoFocus
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
