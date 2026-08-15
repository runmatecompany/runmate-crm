import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { extractLeadFromImages, type ExtractedLeadFields, type Lead, type LeadFormInput } from "../../lib/leads";

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
const AUTO_EXTRACT_DEBOUNCE_MS = 700;

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
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<PendingImage[]>([]);
  const autoExtractTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(
    () => () => {
      if (autoExtractTimer.current) clearTimeout(autoExtractTimer.current);
      if (progressTimer.current) clearInterval(progressTimer.current);
    },
    []
  );

  // Az AI egyetlen válasszal tér vissza, nincs valódi "hányad kész" állapota —
  // ez a becsült előrehaladást animálja 90%-ig, a tényleges válasz
  // megérkezésekor pedig azonnal 100%-ra ugrik. Így legalább látszik, hogy
  // történik valami, nem csak egy statikus "Feldolgozás..." felirat lóg ott.
  function startProgressSimulation() {
    setExtractProgress(0);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setExtractProgress((prev) => {
        if (prev >= 90) return prev;
        const step = prev < 50 ? 7 : prev < 75 ? 3 : 1;
        return Math.min(90, prev + step);
      });
    }, 200);
  }

  function stopProgressSimulation(finalValue: number) {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    setExtractProgress(finalValue);
  }

  // Csak az üres mezőket tölti ki — amit a felhasználó már beírt, azt nem írja felül.
  function applyExtractedFields(fields: ExtractedLeadFields) {
    if (fields.companyName) setCompanyName((prev) => (prev.trim() ? prev : fields.companyName!));
    if (fields.contactName) setContactName((prev) => (prev.trim() ? prev : fields.contactName!));
    if (fields.phone) setPhone((prev) => (prev.trim() ? prev : fields.phone!));
    if (fields.email) setEmail((prev) => (prev.trim() ? prev : fields.email!));
    if (fields.address) setAddress((prev) => (prev.trim() ? prev : fields.address!));
    if (fields.notes) setNotes((prev) => (prev.trim() ? prev : fields.notes!));
  }

  async function runExtraction(imgs: PendingImage[]) {
    if (imgs.length === 0) return;
    setExtracting(true);
    setExtractError(null);
    startProgressSimulation();
    try {
      const fields = await extractLeadFromImages(
        token,
        imgs.map((img) => img.dataUrl)
      );
      applyExtractedFields(fields);
      stopProgressSimulation(100);
      // Rövid ideig még látszik a kész (100%-os) sáv, mielőtt eltűnik.
      setTimeout(() => setExtracting(false), 350);
    } catch (err) {
      stopProgressSimulation(0);
      setExtractError(err instanceof Error ? err.message : "Nem sikerült feldolgozni a képeket");
      setExtracting(false);
    }
  }

  // Új kép hozzáadásakor (feltöltés vagy vágólap) egy rövid szünet után
  // automatikusan elindítja az AI felismerést — nem kell külön gombot nyomni.
  // A debounce azért kell, hogy több egymás után beillesztett kép (pl. névjegy
  // két oldala) egyetlen hívásba kerüljön, ne külön-külön fizessük meg.
  function scheduleAutoExtract() {
    if (autoExtractTimer.current) clearTimeout(autoExtractTimer.current);
    autoExtractTimer.current = setTimeout(() => {
      autoExtractTimer.current = null;
      void runExtraction(imagesRef.current);
    }, AUTO_EXTRACT_DEBOUNCE_MS);
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setExtractError(null);
    const dataUrls = await Promise.all(files.map(readAsDataUrl));
    const room = MAX_IMAGES - imagesRef.current.length;
    if (room <= 0) return;
    const added = dataUrls.slice(0, room).map((dataUrl, i) => ({ id: `${Date.now()}-${i}`, dataUrl }));
    const next = [...imagesRef.current, ...added];
    imagesRef.current = next;
    setImages(next);
    scheduleAutoExtract();
  }

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    await addFiles(files);
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const next = prev.filter((img) => img.id !== id);
      imagesRef.current = next;
      return next;
    });
  }

  // Vágólapról beillesztett kép (pl. "kép másolása" egy screenshotból)
  // fájlmentés nélkül is hozzáadható Ctrl+V-vel, amíg az új lead ablak nyitva van.
  useEffect(() => {
    if (lead) return;
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [lead]);

  function handleManualExtract() {
    if (autoExtractTimer.current) {
      clearTimeout(autoExtractTimer.current);
      autoExtractTimer.current = null;
    }
    void runExtraction(imagesRef.current);
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
      <form className="chat-modal lead-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{lead ? "Lead szerkesztése" : "Új lead"}</h2>

        {!lead && (
          <div className="lead-image-upload">
            <label>
              Fotók (névjegykártya, képernyőfotó) — a kép hozzáadása után az AI automatikusan
              kitölti belőlük a mezőket. Vágólapról is beillesztheted (Ctrl+V), nem kell előbb
              lementened a képet.
            </label>
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
            {images.length > 0 && extracting && (
              <div className="lead-extract-progress">
                <div className="lead-extract-progress-track">
                  <div className="lead-extract-progress-fill" style={{ width: `${extractProgress}%` }} />
                </div>
                <span className="lead-extract-progress-label">AI olvassa a képet... {extractProgress}%</span>
              </div>
            )}
            {images.length > 0 && !extracting && (
              <button type="button" className="lead-image-extract" onClick={handleManualExtract}>
                AI kitöltés újra a fotókból
              </button>
            )}
            {extractError && <p className="login-error">{extractError}</p>}
          </div>
        )}

        <div className="lead-form-row">
          <div>
            <label htmlFor="lead-company">Cégnév</label>
            <input
              id="lead-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.currentTarget.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="lead-contact">Kapcsolattartó</label>
            <input id="lead-contact" value={contactName} onChange={(e) => setContactName(e.currentTarget.value)} />
          </div>
        </div>

        <div className="lead-form-row">
          <div>
            <label htmlFor="lead-phone">Telefon</label>
            <input id="lead-phone" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
          </div>
          <div>
            <label htmlFor="lead-email">Email</label>
            <input id="lead-email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          </div>
        </div>

        <label htmlFor="lead-address">Cím</label>
        <input id="lead-address" value={address} onChange={(e) => setAddress(e.currentTarget.value)} />

        <label htmlFor="lead-notes">Jegyzet</label>
        <textarea id="lead-notes" rows={3} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />

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
