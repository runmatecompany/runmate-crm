import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import {
  DISPOSITION_LABELS,
  TEMPERATURE_LABELS,
  createLeadGenCallAttempt,
  getLeadGenCompany,
  type LeadGenCompanyDetail,
  type LeadGenDisposition,
} from "../../lib/leadgen";

interface CallCardProps {
  companyId: number;
  onDone: () => void;
  onSkip: () => void;
}

const NEEDS_GATEKEEPER_NAME: LeadGenDisposition[] = ["gatekeeper_blocked", "gatekeeper_passed"];
const NEEDS_REACHED_PERSON: LeadGenDisposition[] = [
  "gatekeeper_passed", "dm_unavailable", "interested", "meeting_booked", "not_interested",
];
const NEEDS_NEXT_CALL_AT: LeadGenDisposition[] = [
  "no_answer", "busy", "gatekeeper_blocked", "gatekeeper_passed", "dm_unavailable", "callback_requested",
];
const DISPOSITION_ROW_1: LeadGenDisposition[] = ["interested", "meeting_booked", "callback_requested"];
const DISPOSITION_ROW_2: LeadGenDisposition[] = ["no_answer", "busy", "gatekeeper_blocked", "gatekeeper_passed", "dm_unavailable"];
const DISPOSITION_ROW_3: LeadGenDisposition[] = ["wrong_number", "not_interested"];

function websiteStatusLabel(status: string | null): string {
  switch (status) {
    case "very_good": return "nagyon jó";
    case "average": return "átlagos";
    case "outdated": return "elavult";
    case "poor": return "gyenge";
    case "none": return "nem elérhető";
    default: return "nincs auditálva";
  }
}

export default function CallCard({ companyId, onDone, onSkip }: CallCardProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const [detail, setDetail] = useState<LeadGenCompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDisposition, setPendingDisposition] = useState<LeadGenDisposition | null>(null);
  const [gdprNoticeGiven, setGdprNoticeGiven] = useState(false);
  const [notes, setNotes] = useState("");
  const [gatekeeperName, setGatekeeperName] = useState("");
  const [reachedPerson, setReachedPerson] = useState("");
  const [nextCallAt, setNextCallAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setPendingDisposition(null);
    setGdprNoticeGiven(false);
    setNotes("");
    setGatekeeperName("");
    setReachedPerson("");
    setNextCallAt("");
    setError(null);
    getLeadGenCompany(token, companyId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [token, companyId]);

  async function handleSubmit() {
    if (!token || !pendingDisposition) return;
    if (!gdprNoticeGiven) {
      setError("A GDPR-tájékoztatás elhangzása nélkül a hívás nem zárható le.");
      return;
    }
    if (pendingDisposition === "callback_requested" && !nextCallAt) {
      setError("Visszahívás kéréshez kötelező megadni a pontos időpontot.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createLeadGenCallAttempt(token, companyId, {
        disposition: pendingDisposition,
        gdprNoticeGiven,
        notes: notes.trim() || undefined,
        gatekeeperName: gatekeeperName.trim() || undefined,
        reachedPerson: reachedPerson.trim() || undefined,
        nextCallAt: nextCallAt || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni a hívás eredményét");
      setSaving(false);
    }
  }

  if (loading || !detail) {
    return (
      <div className="lg-callcard">
        <p className="chat-empty-hint">Betöltés...</p>
      </div>
    );
  }

  const { company, whyInteresting, openingLine, bestContact, callAttempts } = detail;
  const lastAttempt = callAttempts[0];
  const showGatekeeperName = pendingDisposition && NEEDS_GATEKEEPER_NAME.includes(pendingDisposition);
  const showReachedPerson = pendingDisposition && NEEDS_REACHED_PERSON.includes(pendingDisposition);
  const showNextCallAt = pendingDisposition && NEEDS_NEXT_CALL_AT.includes(pendingDisposition);

  return (
    <div className="lg-callcard">
      <div className="lg-callcard-header">
        <div>
          <div className="lg-callcard-company">{company.company_name}</div>
          <div className="lg-callcard-sub">
            {[company.industry, company.city].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div className={`lg-callcard-badge lg-callcard-badge--${company.lead_temperature}`}>
          {TEMPERATURE_LABELS[company.lead_temperature]} {company.lead_score}
        </div>
      </div>

      <div className="lg-callcard-phone-row">
        <div>
          <div className="lg-callcard-phone">{company.phone_main ?? "Nincs telefonszám"}</div>
          {company.phone_source && <div className="lg-callcard-phone-source">{company.phone_source}</div>}
        </div>
        {company.phone_main && (
          <a className="lg-callcard-call-btn" href={`tel:${company.phone_main.replace(/\s/g, "")}`}>
            Hívás indítása
          </a>
        )}
      </div>

      <div className="lg-callcard-section">
        <div className="lg-callcard-section-label">Kit kérj</div>
        {bestContact ? (
          <>
            <div>{bestContact.full_name}{bestContact.position ? ` — ${bestContact.position}` : ""}</div>
            <div className="lg-callcard-meta">
              {bestContact.source ?? "forrás nincs megadva"}
              {bestContact.verified ? ", ellenőrizve" : ""}
            </div>
          </>
        ) : (
          <p className="chat-empty-hint">Nem található ismert döntéshozó — kérdezd le a kapuőrtől.</p>
        )}
      </div>

      {whyInteresting.length > 0 && (
        <div className="lg-callcard-section">
          <div className="lg-callcard-section-label">Miért érdekes</div>
          <ul className="lg-callcard-why">
            {whyInteresting.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="lg-callcard-section">
        <div className="lg-callcard-section-label">Első mondat</div>
        <p className="lg-callcard-opening">„{openingLine}”</p>
      </div>

      <p className="lg-callcard-gdpr">
        ⚠ GDPR: mondd el az első 30 mp-ben, honnan van az elérhetőség (weboldal: „{websiteStatusLabel(company.website_status)}”)
      </p>

      <div className="lg-callcard-attempt-row">
        <span>Kísérlet: {company.call_attempts_count}/5</span>
        {lastAttempt && (
          <span>
            Előző: {DISPOSITION_LABELS[lastAttempt.disposition]} ({new Date(lastAttempt.called_at).toLocaleDateString("hu-HU")})
          </span>
        )}
      </div>

      {!pendingDisposition ? (
        <div className="lg-callcard-dispositions">
          <div className="lg-callcard-disposition-row">
            {DISPOSITION_ROW_1.map((d) => (
              <button key={d} type="button" className="lg-disposition-btn lg-disposition-btn--positive" onClick={() => setPendingDisposition(d)}>
                {DISPOSITION_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="lg-callcard-disposition-row">
            {DISPOSITION_ROW_2.map((d) => (
              <button key={d} type="button" className="lg-disposition-btn" onClick={() => setPendingDisposition(d)}>
                {DISPOSITION_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="lg-callcard-disposition-row">
            {DISPOSITION_ROW_3.map((d) => (
              <button key={d} type="button" className="lg-disposition-btn" onClick={() => setPendingDisposition(d)}>
                {DISPOSITION_LABELS[d]}
              </button>
            ))}
          </div>
          <button type="button" className="lg-disposition-btn lg-disposition-btn--danger" onClick={() => setPendingDisposition("do_not_call")}>
            NE HÍVJUK TÖBBET
          </button>
          <button type="button" className="lg-callcard-skip" onClick={onSkip}>
            Kihagyás most, diszpozíció nélkül →
          </button>
        </div>
      ) : (
        <div className="lg-callcard-disposition-form">
          <div className="lg-callcard-disposition-form-title">{DISPOSITION_LABELS[pendingDisposition]}</div>

          {showGatekeeperName && (
            <>
              <label>Kapuőr neve</label>
              <input value={gatekeeperName} onChange={(e) => setGatekeeperName(e.currentTarget.value)} />
            </>
          )}
          {showReachedPerson && (
            <>
              <label>Kit értünk el ténylegesen</label>
              <input value={reachedPerson} onChange={(e) => setReachedPerson(e.currentTarget.value)} />
            </>
          )}
          {showNextCallAt && (
            <>
              <label>
                {pendingDisposition === "callback_requested" ? "Pontos visszahívási időpont (kötelező)" : "Következő hívás időpontja"}
              </label>
              <input type="datetime-local" value={nextCallAt} onChange={(e) => setNextCallAt(e.currentTarget.value)} />
            </>
          )}

          <label>Jegyzet</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />

          <label className="ai-profile-checkbox">
            <input type="checkbox" checked={gdprNoticeGiven} onChange={(e) => setGdprNoticeGiven(e.currentTarget.checked)} />
            Elhangzott a GDPR-tájékoztatás
          </label>

          {error && <p className="login-error">{error}</p>}

          <div className="lg-callcard-disposition-form-actions">
            <button type="button" onClick={() => setPendingDisposition(null)} disabled={saving}>
              Mégse
            </button>
            <button type="button" className="ob-submit-btn" onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? "Mentés..." : "Mentés és következő"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
