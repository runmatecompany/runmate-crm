import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import type { Lead } from "../../lib/leads";
import { listLeadResearch, startLeadResearch, submitManualNotes, type LeadResearch } from "../../lib/leadResearch";

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

export default function LeadDetail({ lead, onBack }: LeadDetailProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [researchList, setResearchList] = useState<LeadResearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualNotes, setManualNotes] = useState("");
  const [submittingNotes, setSubmittingNotes] = useState(false);
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

  async function handleSubmitNotes(researchId: number) {
    if (!token) return;
    setSubmittingNotes(true);
    setError(null);
    try {
      await submitManualNotes(token, researchId, manualNotes);
      setManualNotes("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elküldeni a jegyzeteket");
    } finally {
      setSubmittingNotes(false);
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
            {r.website_analysis && <pre className="chat-empty-hint">{r.website_analysis}</pre>}
            {r.status === "error" && r.error_message && <p className="login-error">{r.error_message}</p>}

            {r.status === "awaiting_input" && r.id === latest?.id && (
              <div className="sm-detail-action">
                <label htmlFor={`manual-notes-${r.id}`}>
                  Kézi kutatási jegyzetek (social media, versenytárs-infó, bármi, amit magad találtál):
                </label>
                <textarea
                  id={`manual-notes-${r.id}`}
                  rows={4}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.currentTarget.value)}
                  placeholder="Pl. Instagram: aktív, hetente posztol, kb. 800 követő. Facebook: nincs. ..."
                />
                <button type="button" disabled={submittingNotes} onClick={() => handleSubmitNotes(r.id)}>
                  {submittingNotes ? "Küldés..." : "Hívás-anyagok generálása"}
                </button>
              </div>
            )}

            {r.status === "done" && (
              <>
                {r.social_manual_notes && (
                  <p className="sm-detail-field">
                    <strong>Kézi jegyzetek:</strong> {r.social_manual_notes}
                  </p>
                )}
                {r.call_hook && (
                  <div className="sm-detail-field">
                    <strong>Hívás-hook</strong>
                    <p>{r.call_hook}</p>
                  </div>
                )}
                {r.call_script && (
                  <div className="sm-detail-field">
                    <strong>Hideghívás-script</strong>
                    <pre className="chat-empty-hint">{r.call_script}</pre>
                  </div>
                )}
                {r.full_audit && (
                  <div className="sm-detail-field">
                    <strong>Teljes audit</strong>
                    <pre className="chat-empty-hint">{r.full_audit}</pre>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
