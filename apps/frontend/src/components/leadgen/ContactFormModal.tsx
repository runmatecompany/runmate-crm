import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { createLeadGenContact, type LeadGenConfidence } from "../../lib/leadgen";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ContactFormModalProps {
  companyId: number;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_OPTIONS = [
  { value: "owner", label: "Tulajdonos" },
  { value: "ceo", label: "Ügyvezető" },
  { value: "marketing", label: "Marketingért felelős" },
  { value: "other", label: "Egyéb" },
];

export default function ContactFormModal({ companyId, onClose, onSaved }: ContactFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [roleType, setRoleType] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [source, setSource] = useState("");
  const [confidence, setConfidence] = useState<LeadGenConfidence | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createLeadGenContact(token, companyId, {
        fullName: fullName.trim(),
        position: position.trim() || undefined,
        roleType: roleType || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        linkedinUrl: linkedinUrl.trim() || undefined,
        source: source.trim() || undefined,
        confidence: confidence || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a kontaktot");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>Új kontakt</h2>
        <p className="chat-modal-hint">
          Soha ne találj ki nevet, telefonszámot vagy pozíciót — ha nincs adat, hagyd üresen.
        </p>

        <label htmlFor="lgc-name">Név</label>
        <input id="lgc-name" value={fullName} onChange={(e) => setFullName(e.currentTarget.value)} autoFocus required />

        <div className="lead-form-row">
          <div>
            <label htmlFor="lgc-position">Pozíció</label>
            <input id="lgc-position" value={position} onChange={(e) => setPosition(e.currentTarget.value)} />
          </div>
          <div>
            <label htmlFor="lgc-role">Szerep</label>
            <select id="lgc-role" value={roleType} onChange={(e) => setRoleType(e.currentTarget.value)}>
              <option value="">Válassz...</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label htmlFor="lgc-phone">Telefonszám</label>
        <input id="lgc-phone" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />

        <label htmlFor="lgc-email">Email</label>
        <input id="lgc-email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />

        <label htmlFor="lgc-linkedin">LinkedIn</label>
        <input id="lgc-linkedin" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.currentTarget.value)} />

        <div className="lead-form-row">
          <div>
            <label htmlFor="lgc-source">Forrás</label>
            <input id="lgc-source" value={source} onChange={(e) => setSource(e.currentTarget.value)} placeholder="pl. LinkedIn, weboldal" />
          </div>
          <div>
            <label htmlFor="lgc-confidence">Megbízhatóság</label>
            <select id="lgc-confidence" value={confidence} onChange={(e) => setConfidence(e.currentTarget.value as LeadGenConfidence)}>
              <option value="">Válassz...</option>
              <option value="high">Magas</option>
              <option value="medium">Közepes</option>
              <option value="low">Alacsony</option>
            </select>
          </div>
        </div>

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving || !fullName.trim()}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
