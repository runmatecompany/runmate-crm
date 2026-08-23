import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface LeadNotInterestedNoteModalProps {
  companyName: string;
  title: string;
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
}

// Közös komponens a két "nem" kimenetre: "Nem érdekli" (korai elutasítás) és
// "Nemet mondott" (tárgyalás utáni elutasítás) — a hívó fél (LeadsPage.tsx)
// dönti el a title-lel, melyik kimenetről van szó, és melyik célállapotba
// kell utána menteni.
export default function LeadNotInterestedNoteModal({ companyName, title, onClose, onSave }: LeadNotInterestedNoteModalProps) {
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
        <h2>
          {companyName} — {title}
        </h2>
        <p className="chat-empty-hint">Miért? Ez segít, ha később hasonló esettel találkozol.</p>

        <label htmlFor="not-interested-note">Jegyzet</label>
        <textarea
          id="not-interested-note"
          rows={6}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="Pl. már van social media ügynöksége, túl drágának találta, nem releváns a szolgáltatás"
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
