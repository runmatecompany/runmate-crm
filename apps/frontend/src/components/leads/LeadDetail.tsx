import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import type { Lead } from "../../lib/leads";
import { listLeadResearch, startLeadResearch, type LeadResearch } from "../../lib/leadResearch";

interface LeadDetailProps {
  lead: Lead;
  onBack: () => void;
}

const POLL_INTERVAL_MS = 3000;
const STATUS_LABELS: Record<LeadResearch["status"], string> = {
  pending: "Várakozik",
  running: "Folyamatban...",
  awaiting_input: "Kész — kézi adatokra vár",
  done: "Kész",
  error: "Hiba történt",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
}

// B fázis: a kutatás egyelőre csak a weboldal-elérhetőséget ellenőrzi és
// 'awaiting_input'-ig jut — a kézi social-form és az AI hook/script/audit
// generálás (a 'done' állapot) a D fázisban kerül ide.
export default function LeadDetail({ lead, onBack }: LeadDetailProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

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
      <button type="button" className="sm-detail-back" onClick={onBack}>
        ← Vissza
      </button>

      <h1>{lead.company_name}</h1>
      <p className="sm-detail-sub">
        {lead.contact_name ?? "Nincs kapcsolattartó"} · {lead.phone ?? "—"} · {lead.email ?? "—"}
      </p>
      {lead.website_url ? (
        <p className="sm-detail-field">
          <a href={lead.website_url} target="_blank" rel="noreferrer">
            {lead.website_url}
          </a>
        </p>
      ) : (
        <p className="chat-empty-hint">Nincs megadva weboldal-cím — add meg a Szerkesztésnél a kutatás előtt.</p>
      )}

      {error && <p className="login-error">{error}</p>}

      <div className="sm-detail-action">
        <button type="button" disabled={starting || Boolean(isActive)} onClick={handleStart}>
          {starting ? "Indítás..." : isActive ? "Kutatás folyamatban..." : "Kutatás indítása"}
        </button>
      </div>

      <h2>Kutatási előzmények</h2>
      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {!loading && researchList.length === 0 && <p className="chat-empty-hint">Még nem volt kutatás.</p>}
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
            {r.status === "awaiting_input" && r.website_analysis && (
              <pre className="chat-empty-hint">{r.website_analysis}</pre>
            )}
            {r.status === "error" && r.error_message && <p className="login-error">{r.error_message}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
