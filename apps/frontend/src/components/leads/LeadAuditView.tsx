import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { updateLead, updateLeadStatus, type Lead, type LeadSector } from "../../lib/leads";

interface LeadAuditViewProps {
  lead: Lead;
  onBack: () => void;
  onChanged: () => void;
}

// Az Audit lépés egész oldalas képernyője — csak az ehhez a lépéshez
// tartozó adatokat mutatja/engedi szerkeszteni (szektor, weboldal, social
// media linkek, jegyzet). "Audit kész"-re mentjük a mezőket (updateLead),
// majd egyben tovább is visszük a leadet Tárgyalásra vár állapotba.
export default function LeadAuditView({ lead, onBack, onChanged }: LeadAuditViewProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [sector, setSector] = useState<LeadSector | null>(lead.sector);
  const [websiteUrl, setWebsiteUrl] = useState(lead.website_url ?? "");
  const [facebookUrl, setFacebookUrl] = useState(lead.facebook_url ?? "");
  const [instagramUrl, setInstagramUrl] = useState(lead.instagram_url ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(lead.tiktok_url ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(lead.youtube_url ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isDirty(): boolean {
    return (
      sector !== lead.sector ||
      websiteUrl !== (lead.website_url ?? "") ||
      facebookUrl !== (lead.facebook_url ?? "") ||
      instagramUrl !== (lead.instagram_url ?? "") ||
      tiktokUrl !== (lead.tiktok_url ?? "") ||
      youtubeUrl !== (lead.youtube_url ?? "") ||
      notes !== (lead.notes ?? "")
    );
  }

  async function saveFields(): Promise<boolean> {
    if (!token) return false;
    setSaving(true);
    setError(null);
    try {
      await updateLead(token, lead.id, {
        companyName: lead.company_name,
        contactName: lead.contact_name ?? undefined,
        contactPosition: lead.contact_position ?? undefined,
        phone: lead.phone ?? undefined,
        email: lead.email ?? undefined,
        address: lead.address ?? undefined,
        city: lead.city ?? undefined,
        notes: notes.trim() || undefined,
        sector: sector ?? undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        facebookUrl: facebookUrl.trim() || undefined,
        instagramUrl: instagramUrl.trim() || undefined,
        tiktokUrl: tiktokUrl.trim() || undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
      });
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni az auditot");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleBack() {
    if (isDirty()) {
      const saved = await saveFields();
      if (!saved) return;
    }
    onBack();
  }

  async function handleAuditDone() {
    if (!token) return;
    const saved = await saveFields();
    if (!saved) return;
    try {
      await updateLeadStatus(token, lead.id, "meeting_scheduled");
      onChanged();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült lezárni az auditot");
    }
  }

  return (
    <div className="sm-detail">
      <button type="button" className="sm-detail-back" onClick={handleBack} disabled={saving}>
        {saving ? "Mentés..." : "← Vissza"}
      </button>

      <h1>{lead.company_name}</h1>
      <p className="sm-detail-sub">
        {lead.contact_name ?? "Nincs kapcsolattartó"}
        {lead.contact_position ? ` (${lead.contact_position})` : ""} · {lead.phone ?? "—"} · {lead.email ?? "—"}
      </p>

      <h2>Audit</h2>
      <div className="sm-detail-action">
        <div className="sm-detail-field">
          <label>Szektor</label>
          <div className="lead-sector-toggle">
            <button
              type="button"
              className={sector === "b2b" ? "lead-sector-option active" : "lead-sector-option"}
              onClick={() => setSector("b2b")}
            >
              B2B
            </button>
            <button
              type="button"
              className={sector === "b2c" ? "lead-sector-option active" : "lead-sector-option"}
              onClick={() => setSector("b2c")}
            >
              B2C
            </button>
          </div>
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-audit-website">Weboldal</label>
          <input
            id="lead-audit-website"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <p className="chat-empty-hint">Social Media — ha egy platformon nincs jelenlét, írj "-"-t.</p>

        <div className="sm-detail-field">
          <label htmlFor="lead-audit-facebook">Facebook</label>
          <input
            id="lead-audit-facebook"
            value={facebookUrl}
            onChange={(e) => setFacebookUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-audit-instagram">Instagram</label>
          <input
            id="lead-audit-instagram"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-audit-tiktok">TikTok</label>
          <input
            id="lead-audit-tiktok"
            value={tiktokUrl}
            onChange={(e) => setTiktokUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-audit-youtube">YouTube</label>
          <input
            id="lead-audit-youtube"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-audit-notes">Jegyzet</label>
          <textarea
            id="lead-audit-notes"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder="Pl. jelenlegi marketing helyzet, mire lenne szüksége, linkek is beilleszthetők szövegként"
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <button type="button" disabled={saving} onClick={handleAuditDone}>
          {saving ? "Mentés..." : "Audit kész"}
        </button>
      </div>
    </div>
  );
}
