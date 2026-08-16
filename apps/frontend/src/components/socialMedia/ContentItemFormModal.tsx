import { useEffect, useState, type FormEvent } from "react";
import type { Client } from "../../lib/clients";
import type { Platform } from "../../lib/socialMedia";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ContentItemFormModalProps {
  clients: Client[];
  onClose: () => void;
  onSave: (input: { clientId: number; title: string; platform: Platform; assignedTo?: number }) => Promise<void>;
}

// A cím ("Munkacím – {mai dátum}") csak egy ésszerű alapérték, hogy a
// backend title-mezője kitöltve legyen — a részletes nézetben utólag
// szabadon átírható, ahogy a script/forgatás dátum is.
function defaultTitle(): string {
  const dateLabel = new Date().toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
  return `Tartalom – ${dateLabel}`;
}

export default function ContentItemFormModal({ clients, onClose, onSave }: ContentItemFormModalProps) {
  useEscapeToClose(onClose);
  const [clientId, setClientId] = useState<number | "">(clients[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId === "" && clients[0]) setClientId(clients[0].id);
  }, [clients, clientId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (clientId === "") return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        clientId,
        title: defaultTitle(),
        platform: "instagram",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni a tartalmat");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>Új tartalom</h2>

        {clients.length === 0 ? (
          <p className="chat-empty-hint">Nincs még felvett ügyfél — előbb vegyél fel egyet az Ügyfelek modulban.</p>
        ) : (
          <>
            <label htmlFor="ci-client">Ügyfél</label>
            <select id="ci-client" value={clientId} onChange={(e) => setClientId(Number(e.currentTarget.value))} autoFocus>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </>
        )}

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving || clients.length === 0}>
            {saving ? "Létrehozás..." : "Létrehozás"}
          </button>
        </div>
      </form>
    </div>
  );
}
