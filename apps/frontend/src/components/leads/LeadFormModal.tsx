import { useState, type FormEvent } from "react";
import type { Lead, LeadFormInput } from "../../lib/leads";

interface LeadFormModalProps {
  lead: Lead | null;
  onClose: () => void;
  onSave: (input: LeadFormInput) => Promise<void>;
}

export default function LeadFormModal({ lead, onClose, onSave }: LeadFormModalProps) {
  const [companyName, setCompanyName] = useState(lead?.company_name ?? "");
  const [contactName, setContactName] = useState(lead?.contact_name ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [address, setAddress] = useState(lead?.address ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");
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
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a leadet");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <form className="chat-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{lead ? "Lead szerkesztése" : "Új lead"}</h2>

        <label htmlFor="lead-company">Cégnév</label>
        <input
          id="lead-company"
          value={companyName}
          onChange={(e) => setCompanyName(e.currentTarget.value)}
          required
          autoFocus
        />

        <label htmlFor="lead-contact">Kapcsolattartó</label>
        <input id="lead-contact" value={contactName} onChange={(e) => setContactName(e.currentTarget.value)} />

        <label htmlFor="lead-phone">Telefon</label>
        <input id="lead-phone" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />

        <label htmlFor="lead-email">Email</label>
        <input id="lead-email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />

        <label htmlFor="lead-address">Cím</label>
        <input id="lead-address" value={address} onChange={(e) => setAddress(e.currentTarget.value)} />

        <label htmlFor="lead-notes">Jegyzet</label>
        <textarea id="lead-notes" rows={4} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />

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
