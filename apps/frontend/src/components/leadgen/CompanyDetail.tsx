import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import {
  DISPOSITION_LABELS,
  LEAD_STATUS_LABELS,
  TEMPERATURE_LABELS,
  auditLeadGenCompanyWebsite,
  deleteLeadGenCompany,
  deleteLeadGenContact,
  getLeadGenCompany,
  type LeadGenCompanyDetail,
} from "../../lib/leadgen";
import CompanyFormModal from "./CompanyFormModal";
import ContactFormModal from "./ContactFormModal";

interface CompanyDetailProps {
  companyId: number;
  onBack: () => void;
}

export default function CompanyDetail({ companyId, onBack }: CompanyDetailProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";

  const [detail, setDetail] = useState<LeadGenCompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    getLeadGenCompany(token, companyId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [token, companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAudit() {
    if (!token) return;
    setAuditing(true);
    try {
      await auditLeadGenCompanyWebsite(token, companyId);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült lefuttatni az auditot");
    } finally {
      setAuditing(false);
    }
  }

  async function handleDelete() {
    if (!token || !detail) return;
    if (!confirm(`Biztosan törlöd a(z) "${detail.company.company_name}" céget?`)) return;
    await deleteLeadGenCompany(token, companyId);
    onBack();
  }

  async function handleDeleteContact(contactId: number) {
    if (!token) return;
    if (!confirm("Biztosan törlöd ezt a kontaktot?")) return;
    await deleteLeadGenContact(token, contactId);
    refresh();
  }

  if (loading || !detail) {
    return <p className="chat-empty-hint">Betöltés...</p>;
  }

  const { company, contacts, callAttempts } = detail;

  return (
    <div className="sm-detail">
      <button type="button" className="sm-detail-back" onClick={onBack}>
        ← Vissza
      </button>

      <div className="leads-header">
        <h1>{company.company_name}</h1>
        <span className={`lg-temp-badge lg-temp-badge--${company.lead_temperature}`}>
          {TEMPERATURE_LABELS[company.lead_temperature]} {company.lead_score}
        </span>
      </div>
      <p className="sm-detail-sub">
        {[company.industry, company.city, LEAD_STATUS_LABELS[company.lead_status]].filter(Boolean).join(" · ")}
      </p>

      <div className="leads-row-actions" style={{ marginBottom: "1em" }}>
        <button type="button" onClick={() => setShowEdit(true)}>Szerkesztés</button>
        {company.website && (
          <button type="button" onClick={() => void handleAudit()} disabled={auditing}>
            {auditing ? "Ellenőrzés..." : "Weboldal újraellenőrzése"}
          </button>
        )}
        {isAdmin && <button type="button" onClick={() => void handleDelete()}>Törlés</button>}
      </div>

      <div className="sm-detail-action">
        <h3>Cégadatok</h3>
        <p>Adószám: {company.tax_number ?? "—"}</p>
        <p>Cím: {[company.address, company.city, company.county].filter(Boolean).join(", ") || "—"}</p>
        <p>
          Weboldal:{" "}
          {company.website ? (
            <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a>
          ) : "—"}
          {company.website_status && ` (${company.website_status}${company.website_mobile_friendly === false ? ", nem mobilbarát" : ""})`}
        </p>
        <p>
          Telefon: {company.phone_main ?? "—"} {company.phone_source && `(${company.phone_source})`}
        </p>
        <p>
          Árbevétel:{" "}
          {company.revenue_current
            ? `${Math.round(Number(company.revenue_current) / 1_000_000)} M Ft (${company.revenue_year ?? "?"}, ${company.revenue_verified ? "ellenőrzött" : "nem ellenőrzött"})`
            : "—"}
        </p>
        <p>Létszám: {company.employee_count ?? "—"}</p>
      </div>

      <div className="sm-detail-action">
        <button type="button" onClick={() => setShowBreakdown((v) => !v)}>
          {showBreakdown ? "▾" : "▸"} Miért ennyi pont? ({company.lead_score})
        </button>
        {showBreakdown && (
          <pre className="lg-score-breakdown">{company.lead_score_breakdown ?? "Nincs még pontozva."}</pre>
        )}
      </div>

      <div className="sm-detail-action">
        <div className="leads-header">
          <h3>Kontaktok</h3>
          <button type="button" onClick={() => setShowContactForm(true)}>+ Kontakt</button>
        </div>
        {contacts.length === 0 && <p className="chat-empty-hint">Nincs még ismert kontakt.</p>}
        {contacts.map((c) => (
          <div key={c.id} className="lg-contact-row">
            <div>
              <strong>{c.full_name}</strong>{c.position ? ` — ${c.position}` : ""}
              <div className="lg-callcard-meta">
                {c.phone ?? "nincs telefon"} · {c.email ?? "nincs email"}
                {c.source && ` · ${c.source}`}
              </div>
            </div>
            <button type="button" onClick={() => void handleDeleteContact(c.id)}>Törlés</button>
          </div>
        ))}
      </div>

      <div className="sm-detail-action">
        <h3>Hívástörténet</h3>
        {callAttempts.length === 0 && <p className="chat-empty-hint">Még nem volt hívási kísérlet.</p>}
        <ul className="sm-approval-history">
          {callAttempts.map((a) => (
            <li key={a.id} className="sm-approval-history-item">
              <div>
                <strong>{DISPOSITION_LABELS[a.disposition]}</strong> — {new Date(a.called_at).toLocaleString("hu-HU")}
              </div>
              <div className="sm-approval-history-meta">
                {a.called_by_name && `${a.called_by_name}`}
                {a.notes && ` · ${a.notes}`}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {showEdit && (
        <CompanyFormModal
          company={company}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            refresh();
          }}
        />
      )}

      {showContactForm && (
        <ContactFormModal
          companyId={companyId}
          onClose={() => setShowContactForm(false)}
          onSaved={() => {
            setShowContactForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
