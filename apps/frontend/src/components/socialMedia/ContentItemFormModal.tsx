import { useEffect, useState, type FormEvent } from "react";
import type { Client } from "../../lib/clients";
import type { Colleague } from "../../lib/chat";
import { PLATFORM_LABELS, type Platform } from "../../lib/socialMedia";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ContentItemFormModalProps {
  clients: Client[];
  colleagues: Colleague[];
  onClose: () => void;
  onSave: (input: { clientId: number; title: string; platform: Platform; assignedTo?: number }) => Promise<void>;
}

const PLATFORM_OPTIONS: Platform[] = ["instagram", "tiktok", "youtube", "facebook"];

export default function ContentItemFormModal({ clients, colleagues, onClose, onSave }: ContentItemFormModalProps) {
  useEscapeToClose(onClose);
  const [clientId, setClientId] = useState<number | "">(clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [assignedTo, setAssignedTo] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId === "" && clients[0]) setClientId(clients[0].id);
  }, [clients, clientId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || clientId === "") return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        clientId,
        title: title.trim(),
        platform,
        assignedTo: assignedTo === "" ? undefined : assignedTo,
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
            <select id="ci-client" value={clientId} onChange={(e) => setClientId(Number(e.currentTarget.value))}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>

            <label htmlFor="ci-title">Munkacím</label>
            <input id="ci-title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required autoFocus />

            <div className="lead-form-row">
              <div>
                <label htmlFor="ci-platform">Platform</label>
                <select id="ci-platform" value={platform} onChange={(e) => setPlatform(e.currentTarget.value as Platform)}>
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ci-assignee">Felelős</label>
                <select
                  id="ci-assignee"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.currentTarget.value === "" ? "" : Number(e.currentTarget.value))}
                >
                  <option value="">Nincs kijelölve</option>
                  {colleagues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
