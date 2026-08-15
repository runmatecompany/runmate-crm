import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { extractLeadFromImages, type Lead, type LeadFormInput } from "../../lib/leads";

interface LeadFormModalProps {
  lead: Lead | null;
  token: string;
  onClose: () => void;
  onSave: (input: LeadFormInput) => Promise<void>;
}

interface PendingImage {
  id: string;
  dataUrl: string;
}

const MAX_IMAGES = 5;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Nem sikerült beolvasni a képet"));
    reader.readAsDataURL(file);
  });
}

export default function LeadFormModal({ lead, token, onClose, onSave }: LeadFormModalProps) {
  const [companyName, setCompanyName] = useState(lead?.company_name ?? "");
  const [contactName, setContactName] = useState(lead?.contact_name ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [address, setAddress] = useState(lead?.address ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [images, setImages] = useState<PendingImage[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (files.length === 0) return;
    setExtractError(null);
    const room = MAX_IMAGES - images.length;
    const accepted = files.slice(0, room);
    const dataUrls = await Promise.all(accepted.map(readAsDataUrl));
    setImages((prev) => [
      ...prev,
      ...dataUrls.map((dataUrl, i) => ({ id: `${Date.now()}-${i}`, dataUrl })),
    ]);
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  async function handleExtract() {
    if (images.length === 0) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const fields = await extractLeadFromImages(
        token,
        images.map((img) => img.dataUrl)
      );
      if (fields.companyName && !companyName.trim()) setCompanyName(fields.companyName);
      if (fields.contactName && !contactName.trim()) setContactName(fields.contactName);
      if (fields.phone && !phone.trim()) setPhone(fields.phone);
      if (fields.email && !email.trim()) setEmail(fields.email);
      if (fields.address && !address.trim()) setAddress(fields.address);
      if (fields.notes && !notes.trim()) setNotes(fields.notes);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Nem sikerült feldolgozni a képeket");
    } finally {
      setExtracting(false);
    }
  }

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

        {!lead && (
          <div className="lead-image-upload">
            <label>Fotók (névjegykártya, képernyőfotó) — az AI kitölti belőlük a mezőket</label>
            <div className="lead-image-list">
              {images.map((img) => (
                <div key={img.id} className="lead-image-thumb">
                  <img src={img.dataUrl} alt="" />
                  <button type="button" className="lead-image-remove" onClick={() => removeImage(img.id)}>
                    ×
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button type="button" className="lead-image-add" onClick={() => fileInputRef.current?.click()}>
                  + Kép
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFilesSelected}
            />
            {images.length > 0 && (
              <button type="button" className="lead-image-extract" onClick={handleExtract} disabled={extracting}>
                {extracting ? "Feldolgozás..." : "AI kitöltés a fotókból"}
              </button>
            )}
            {extractError && <p className="login-error">{extractError}</p>}
          </div>
        )}

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
