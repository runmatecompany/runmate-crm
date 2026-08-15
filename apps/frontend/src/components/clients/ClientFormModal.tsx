import { useState, type FormEvent } from "react";
import type { Client, ClientFormInput } from "../../lib/clients";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClientFormModalProps {
  client: Client | null;
  onClose: () => void;
  onSave: (input: ClientFormInput) => Promise<void>;
}

export default function ClientFormModal({ client, onClose, onSave }: ClientFormModalProps) {
  useEscapeToClose(onClose);
  const [companyName, setCompanyName] = useState(client?.company_name ?? "");
  const [contactName, setContactName] = useState(client?.contact_name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni az ügyfelet");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>{client ? "Ügyfél szerkesztése" : "Új ügyfél"}</h2>

        <div className="lead-form-row">
          <div>
            <label htmlFor="client-company">Cégnév</label>
            <input
              id="client-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.currentTarget.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="client-contact">Kapcsolattartó</label>
            <input id="client-contact" value={contactName} onChange={(e) => setContactName(e.currentTarget.value)} />
          </div>
        </div>

        <div className="lead-form-row">
          <div>
            <label htmlFor="client-phone">Telefon</label>
            <input id="client-phone" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
          </div>
          <div>
            <label htmlFor="client-email">Email</label>
            <input id="client-email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          </div>
        </div>

        <label htmlFor="client-address">Cím</label>
        <input id="client-address" value={address} onChange={(e) => setAddress(e.currentTarget.value)} />

        <label htmlFor="client-notes">Jegyzet</label>
        <textarea id="client-notes" rows={3} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />

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
