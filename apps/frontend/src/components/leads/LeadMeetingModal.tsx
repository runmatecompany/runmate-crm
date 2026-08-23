import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import type { Lead } from "../../lib/leads";

interface LeadMeetingModalProps {
  lead: Lead;
  onClose: () => void;
  onSave: (meetingDate: string, address: string) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// A hívás során egyeztetett tárgyalási időpontot és címet menti — a
// Név/Pozíció/Telefonszám csak tájékoztató jelleggel, nem szerkeszthetően
// jelenik meg (azt már tudjuk a leadből). Mentéskor a lead egyben
// "decision_pending" állapotba is kerül (lásd LeadsPage.tsx
// handleSaveMeeting).
export default function LeadMeetingModal({ lead, onClose, onSave }: LeadMeetingModalProps) {
  useEscapeToClose(onClose);
  const [meetingDate, setMeetingDate] = useState(lead.meeting_date ?? todayIso());
  const [address, setAddress] = useState(lead.address ?? "");
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
      await onSave(meetingDate, address.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{lead.company_name} — Tárgyalásra vár</h2>
        <p className="chat-empty-hint">
          {lead.contact_name ?? "Nincs kapcsolattartó"}
          {lead.contact_position ? ` (${lead.contact_position})` : ""} · {lead.phone ?? "—"}
        </p>

        <label htmlFor="meeting-date">Időpont</label>
        <input
          id="meeting-date"
          type="date"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.currentTarget.value)}
          autoFocus
          required
        />

        <label htmlFor="meeting-address">Cím</label>
        <input
          id="meeting-address"
          value={address}
          onChange={(e) => setAddress(e.currentTarget.value)}
          placeholder="Hol lesz a tárgyalás?"
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Mentés..." : "Elfogadási idő"}
          </button>
        </div>
      </form>
    </div>
  );
}
