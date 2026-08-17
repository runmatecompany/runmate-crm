import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { updateLead, type Lead } from "../../lib/leads";
import { listLeadResearch, startLeadResearch, type LeadResearch } from "../../lib/leadResearch";

interface LeadDetailProps {
  lead: Lead;
  onBack: () => void;
  onChanged: () => void;
}

const POLL_INTERVAL_MS = 3000;
const STATUS_LABELS: Record<LeadResearch["status"], string> = {
  pending: "Várakozik",
  running: "Folyamatban...",
  awaiting_input: "Kész",
  done: "Kész",
  error: "Hiba történt",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
}

// A kutatási kérdőív (weboldal + social linkek) bármikor kitölthető,
// nincs a "Kutatás indítása" gombhoz kötve — az utóbbi csak egy opcionális,
// automatikus weboldal-elérhetőségi ellenőrzés.
export default function LeadDetail({ lead, onBack, onChanged }: LeadDetailProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [websiteUrl, setWebsiteUrl] = useState(lead.website_url ?? "");
  const [facebookUrl, setFacebookUrl] = useState(lead.facebook_url ?? "");
  const [instagramUrl, setInstagramUrl] = useState(lead.instagram_url ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(lead.tiktok_url ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(lead.youtube_url ?? "");
  const [savingQuestionnaire, setSavingQuestionnaire] = useState(false);

  const [researchList, setResearchList] = useState<LeadResearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    listLeadResearch(token, lead.id)
      .then(setResearchList)
      .finally(() => setLoading(false));
  }, [token, lead.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const latest = researchList[0];
  const isActive = latest && (latest.status === "pending" || latest.status === "running");

  // Amíg a legutóbbi futás pending/running, 3 mp-enként újralekérdezzük a
  // teljes listát — nincs websocket/valós idejű push ehhez, ez a legkisebb,
  // meglévő mintákhoz illeszkedő megoldás.
  useEffect(() => {
    if (!isActive) return;
    pollTimer.current = setTimeout(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [isActive, researchList, refresh]);

  function isQuestionnaireDirty(): boolean {
    return (
      websiteUrl !== (lead.website_url ?? "") ||
      facebookUrl !== (lead.facebook_url ?? "") ||
      instagramUrl !== (lead.instagram_url ?? "") ||
      tiktokUrl !== (lead.tiktok_url ?? "") ||
      youtubeUrl !== (lead.youtube_url ?? "")
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
        notes: lead.notes ?? undefined,
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

  async function handleStart() {
    if (!token) return;
    setStarting(true);
    setError(null);
    try {
      await startLeadResearch(token, lead.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elindítani a kutatást");
    } finally {
      setStarting(false);
    }
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

      <h2>Weboldal-ellenőrzés (opcionális)</h2>
      <div className="sm-detail-action">
        <button type="button" disabled={starting || Boolean(isActive)} onClick={handleStart}>
          {starting ? "Indítás..." : isActive ? "Folyamatban..." : "Weboldal ellenőrzése"}
        </button>

        {loading && <p className="chat-empty-hint">Betöltés...</p>}
        {!loading && researchList.length > 0 && (
          <ul className="sm-approval-history">
            {researchList.map((r) => (
              <li key={r.id} className="sm-approval-history-item">
                <div>
                  <strong>{STATUS_LABELS[r.status]}</strong>
                </div>
                <div className="sm-approval-history-meta">
                  Indítva: {formatDateTime(r.created_at)}
                  {r.requested_by_name && ` · ${r.requested_by_name}`}
                </div>
                {r.website_analysis && <pre className="chat-empty-hint">{r.website_analysis}</pre>}
                {r.status === "error" && r.error_message && <p className="login-error">{r.error_message}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
