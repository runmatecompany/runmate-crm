import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { updateLead, type Lead } from "../../lib/leads";

interface LeadDetailProps {
  lead: Lead;
  onBack: () => void;
  onChanged: () => void;
}

// A kutatási kérdőív (weboldal + social linkek) kézzel töltendő ki hívás
// előkészítéshez — nincs hozzá semmilyen automatizált ellenőrzés/keresés
// (azt korábban, a felhasználó kérésére, teljesen eltávolítottuk).
export default function LeadDetail({ lead, onBack, onChanged }: LeadDetailProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [websiteUrl, setWebsiteUrl] = useState(lead.website_url ?? "");
  const [facebookUrl, setFacebookUrl] = useState(lead.facebook_url ?? "");
  const [instagramUrl, setInstagramUrl] = useState(lead.instagram_url ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(lead.tiktok_url ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(lead.youtube_url ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [savingQuestionnaire, setSavingQuestionnaire] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isQuestionnaireDirty(): boolean {
    return (
      websiteUrl !== (lead.website_url ?? "") ||
      facebookUrl !== (lead.facebook_url ?? "") ||
      instagramUrl !== (lead.instagram_url ?? "") ||
      tiktokUrl !== (lead.tiktok_url ?? "") ||
      youtubeUrl !== (lead.youtube_url ?? "") ||
      notes !== (lead.notes ?? "")
    );
  }

  async function saveQuestionnaire(): Promise<boolean> {
    if (!token) return false;
    setSavingQuestionnaire(true);
    setError(null);
    try {
      await updateLead(token, lead.id, {
        companyName: lead.company_name,
        contactName: lead.contact_name ?? undefined,
        phone: lead.phone ?? undefined,
        email: lead.email ?? undefined,
        address: lead.address ?? undefined,
        notes: notes.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        facebookUrl: facebookUrl.trim() || undefined,
        instagramUrl: instagramUrl.trim() || undefined,
        tiktokUrl: tiktokUrl.trim() || undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
      });
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a kérdőívet");
      return false;
    } finally {
      setSavingQuestionnaire(false);
    }
  }

  // Ha kimentetlen módosítás van a kérdőíven, "Vissza" kattintáskor
  // automatikusan elmentjük, hogy ne vesszen el semmi — csak akkor
  // navigálunk vissza, ha a mentés sikerült (hiba esetén az oldalon marad,
  // hogy lássa a hibaüzenetet és újrapróbálhassa).
  async function handleBack() {
    if (isQuestionnaireDirty()) {
      const saved = await saveQuestionnaire();
      if (!saved) return;
    }
    onBack();
  }

  return (
    <div className="sm-detail">
      <button type="button" className="sm-detail-back" onClick={handleBack} disabled={savingQuestionnaire}>
        {savingQuestionnaire ? "Mentés..." : "← Vissza"}
      </button>

      <h1>{lead.company_name}</h1>
      <p className="sm-detail-sub">
        {lead.contact_name ?? "Nincs kapcsolattartó"} · {lead.phone ?? "—"} · {lead.email ?? "—"}
      </p>

      <h2>Kutatási kérdőív</h2>
      <div className="sm-detail-action">
        <div className="sm-detail-field">
          <label htmlFor="lead-research-notes">Jegyzet (hívás előkészítéshez)</label>
          <textarea
            id="lead-research-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder="Amit érdemes tudni, mielőtt felhívod — pl. mit találtál, mire hivatkozz, kit keress"
          />
        </div>

        <p className="chat-empty-hint">Add meg a linkeket, amiket találtál — ha egy platformon nincs jelenlét, írj "-"-t.</p>

        <div className="sm-detail-field">
          <label htmlFor="lead-research-website">Weboldal</label>
          <input
            id="lead-research-website"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-research-facebook">Facebook</label>
          <input
            id="lead-research-facebook"
            value={facebookUrl}
            onChange={(e) => setFacebookUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-research-instagram">Instagram</label>
          <input
            id="lead-research-instagram"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-research-tiktok">TikTok</label>
          <input
            id="lead-research-tiktok"
            value={tiktokUrl}
            onChange={(e) => setTiktokUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        <div className="sm-detail-field">
          <label htmlFor="lead-research-youtube">YouTube</label>
          <input
            id="lead-research-youtube"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.currentTarget.value)}
            placeholder="https://... vagy -"
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <button type="button" disabled={savingQuestionnaire} onClick={saveQuestionnaire}>
          {savingQuestionnaire ? "Mentés..." : "Kérdőív mentése"}
        </button>
      </div>
    </div>
  );
}
