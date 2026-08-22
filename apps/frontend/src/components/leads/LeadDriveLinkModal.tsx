import { useState, type FormEvent } from "react";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface LeadDriveLinkModalProps {
  companyName: string;
  kind: "contract" | "invoice";
  hasEmail: boolean;
  onClose: () => void;
  onSave: (driveLink: string) => Promise<void>;
}

const COPY = {
  contract: {
    title: "Szerződés kiküldése",
    label: "Szerződés Drive-linkje",
    hint: "Illeszd be a kész szerződés Drive-linkjét — mentéskor a rendszer automatikusan kiküldi emailben a leadnek.",
  },
  invoice: {
    title: "Számlázás",
    label: "Számla Drive-linkje",
    hint: "Illeszd be a kész számla Drive-linkjét — mentéskor a rendszer automatikusan kiküldi emailben, majd a lead automatikusan ügyféllé alakul és megnyílik az onboarding.",
  },
} as const;

// Közös komponens a Szerződés/Számla lépéshez — a két lépés csak
// szövegben és a mentés utáni (LeadsPage.tsx-ben történő) automatizmusban
// tér el, a form maga azonos.
export default function LeadDriveLinkModal({ companyName, kind, hasEmail, onClose, onSave }: LeadDriveLinkModalProps) {
  useEscapeToClose(onClose);
  const [driveLink, setDriveLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!driveLink.trim()) {
      setError("Add meg a Drive-linket.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(driveLink.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>
          {companyName} — {copy.title}
        </h2>
        <p className="chat-empty-hint">{copy.hint}</p>
        {!hasEmail && (
          <p className="chat-modal-hint">
            Ennek a leadnek nincs megadva email cím — a link elmentődik, de emailt nem tud küldeni a rendszer.
          </p>
        )}

        <label htmlFor="drive-link">{copy.label}</label>
        <input
          id="drive-link"
          type="text"
          value={driveLink}
          onChange={(e) => setDriveLink(e.currentTarget.value)}
          placeholder="https://drive.google.com/..."
          autoFocus
          required
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Mentés..." : "Mentés és küldés"}
          </button>
        </div>
      </form>
    </div>
  );
}
