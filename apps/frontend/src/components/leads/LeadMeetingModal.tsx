import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface LeadMeetingModalProps {
  companyName: string;
  onClose: () => void;
  onSave: (meetingDate: string, note: string) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// A LeadCallbackModal mintája — a tárgyalás dátuma emlékeztető feladatot
// hoz létre a Feladatok modulban (lásd LeadsPage.tsx handleSaveMeeting).
export default function LeadMeetingModal({ companyName, onClose, onSave }: LeadMeetingModalProps) {
  useEscapeToClose(onClose);
  const [meetingDate, setMeetingDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!meetingDate) {
      setError("Add meg a tárgyalás időpontját.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(meetingDate, note.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{companyName} — Tárgyalás</h2>
        <p className="chat-empty-hint">
          Mikorra beszéltétek meg a tárgyalást? Ebből automatikusan létrejön egy emlékeztető feladat a
          Feladatok modulban.
        </p>

        <label htmlFor="meeting-date">Tárgyalás időpontja</label>
        <input
          id="meeting-date"
          type="date"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.currentTarget.value)}
          autoFocus
          required
        />

        <label htmlFor="meeting-note">Jegyzet (nem kötelező)</label>
        <textarea
          id="meeting-note"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="Pl. miben egyeztetek meg, mit kell előkészíteni a tárgyalásra"
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
