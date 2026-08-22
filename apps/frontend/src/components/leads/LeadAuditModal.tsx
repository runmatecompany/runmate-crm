import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface LeadAuditModalProps {
  companyName: string;
  onClose: () => void;
  onSave: (outcome: "success" | "fail", note: string) => Promise<void>;
}

// Az Audit lépés kimenete egyben a következő állapotot is eldönti:
// sikeres → Tárgyalásra vár, sikertelen → Nem érdekli (lásd LeadsPage.tsx
// handleSaveAudit) — ezért itt két külön gomb van "Mentés" helyett.
export default function LeadAuditModal({ companyName, onClose, onSave }: LeadAuditModalProps) {
  useEscapeToClose(onClose);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOutcome(e: FormEvent, outcome: "success" | "fail") {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(outcome, note.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={(e) => e.preventDefault()}>
        <h2>{companyName} — Audit</h2>
        <p className="chat-empty-hint">
          Mit derítettél ki az ügyfélről a hívás alapján? Ha sikeres volt az audit, a lead a Tárgyalásra vár
          oszlopba kerül, ha nem, Nem érdekli-be.
        </p>

        <label htmlFor="audit-note">Jegyzet</label>
        <textarea
          id="audit-note"
          rows={6}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="Pl. jelenlegi marketing helyzet, mire lenne szüksége, miért alkalmas/alkalmatlan"
          autoFocus
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="button" onClick={(e) => handleOutcome(e, "fail")} disabled={saving}>
            Sikertelen
          </button>
          <button type="button" onClick={(e) => handleOutcome(e, "success")} disabled={saving}>
            {saving ? "Mentés..." : "Sikeres"}
          </button>
        </div>
      </form>
    </div>
  );
}
