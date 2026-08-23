import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface LeadCallbackReasonModalProps {
  companyName: string;
  onClose: () => void;
  onSave: (reason: string) => Promise<void>;
}

// "Visszahívandó" bármelyik nem-lezárt lépésről felvehető — ez az indoklás
// mindig látszik a kártyán, amíg a lead ebben az állapotban van (lásd
// LeadsPage.tsx), utána a kezelő bármelyik releváns lépésre továbbviheti.
export default function LeadCallbackReasonModal({ companyName, onClose, onSave }: LeadCallbackReasonModalProps) {
  useEscapeToClose(onClose);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Add meg, miért kell visszahívni.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{companyName} — Visszahívandó</h2>
        <p className="chat-empty-hint">Miért kell visszahívni? Ez mindig látszik majd a kártyán.</p>

        <label htmlFor="callback-reason">Indoklás</label>
        <textarea
          id="callback-reason"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="Pl. nem vette fel, foglalt volt, kért egy másik időpontot"
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
