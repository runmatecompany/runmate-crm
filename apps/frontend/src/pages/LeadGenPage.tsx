import { lazy, Suspense, useCallback, useEffect, useState, type MouseEvent } from "react";
import { useAuth } from "../lib/auth";
import {
  LEAD_STATUS_LABELS,
  TEMPERATURE_LABELS,
  deleteLeadGenCompany,
  listLeadGenCallQueue,
  listLeadGenCompanies,
  listLeadGenDoNotCall,
  type LeadGenCompany,
} from "../lib/leadgen";
import CallCard from "../components/leadgen/CallCard";
import CompanyFormModal from "../components/leadgen/CompanyFormModal";
import CompanyDetail from "../components/leadgen/CompanyDetail";

// A CSV/Excel import modal az exceljs csomagot importálja (~950 kB
// minifikálva) — lusta betöltéssel csak akkor kerül be a futó kódba,
// amikor valaki ténylegesen megnyitja az import ablakot, nem minden Lead
// Gen oldal-betöltéskor.
const CsvImportModal = lazy(() => import("../components/leadgen/CsvImportModal"));

type LeadGenTab = "callqueue" | "companies" | "dnc";

export default function LeadGenPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [tab, setTab] = useState<LeadGenTab>("callqueue");
  const [hasAccess, setHasAccess] = useState(true);
  const [loading, setLoading] = useState(true);

  const [companies, setCompanies] = useState<LeadGenCompany[]>([]);
  const [dncCompanies, setDncCompanies] = useState<LeadGenCompany[]>([]);
  const [callQueue, setCallQueue] = useState<LeadGenCompany[] | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);

  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [openCompanyId, setOpenCompanyId] = useState<number | null>(null);

  const refreshCompanies = useCallback(() => {
    if (!token) return;
    listLeadGenCompanies(token)
      .then((res) => {
        setCompanies(res.companies);
        setHasAccess(true);
      })
      .catch(() => setHasAccess(false))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refreshCompanies();
  }, [refreshCompanies]);

  useEffect(() => {
    if (!token || tab !== "dnc") return;
    listLeadGenDoNotCall(token).then((res) => setDncCompanies(res.companies));
  }, [token, tab]);

  function startCallQueue() {
    if (!token) return;
    listLeadGenCallQueue(token, 15).then((res) => {
      setCallQueue(res.companies);
      setQueueIndex(0);
    });
  }

  function advanceQueue() {
    setQueueIndex((i) => i + 1);
    refreshCompanies();
  }

  async function handleDeleteCompany(e: MouseEvent, company: LeadGenCompany) {
    e.stopPropagation();
    if (!token) return;
    if (!confirm(`Biztosan eltávolítod a(z) "${company.company_name}" céget a listából?`)) return;
    await deleteLeadGenCompany(token, company.id);
    refreshCompanies();
  }

  if (!loading && !hasAccess) {
    return (
      <main className="leads-page">
        <h1>Lead Gen</h1>
        <p className="chat-empty-hint">Nincs hozzáférésed a Lead Gen modulhoz. Kérj hozzáférést egy adminisztrátortól.</p>
      </main>
    );
  }

  if (openCompanyId != null) {
    return (
      <main className="leads-page">
        <CompanyDetail
          companyId={openCompanyId}
          onBack={() => {
            setOpenCompanyId(null);
            refreshCompanies();
          }}
        />
      </main>
    );
  }

  return (
    <main className="leads-page">
      <div className="leads-header">
        <h1>Lead Gen</h1>
        {tab === "companies" && (
          <div className="leads-row-actions">
            <button type="button" onClick={() => setShowCsvImport(true)}>
              CSV / Excel import
            </button>
            <button type="button" onClick={() => setShowCompanyForm(true)}>
              + Új cég
            </button>
          </div>
        )}
      </div>

      <div className="leads-status-tabs">
        <button type="button" className={tab === "callqueue" ? "leads-status-tab active" : "leads-status-tab"} onClick={() => setTab("callqueue")}>
          Mai hívólista
        </button>
        <button type="button" className={tab === "companies" ? "leads-status-tab active" : "leads-status-tab"} onClick={() => setTab("companies")}>
          Cégek ({companies.length})
        </button>
        <button type="button" className={tab === "dnc" ? "leads-status-tab active" : "leads-status-tab"} onClick={() => setTab("dnc")}>
          Nem hívható
        </button>
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && tab === "callqueue" && (
        <>
          {callQueue == null && (
            <div className="lg-callqueue-start">
              <p className="chat-empty-hint">
                A mai hívólista a legfontosabb, hívásra kész cégeket állítja össze: visszahívást ígértünk / meleg
                nyomon vagyunk / HOT leadek / esedékes újrahívások / WARM leadek sorrendben, max. 15 hívás naponta.
              </p>
              <button type="button" className="ob-submit-btn" onClick={startCallQueue}>
                MAI HÍVÓLISTA INDÍTÁSA
              </button>
            </div>
          )}

          {callQueue != null && queueIndex >= callQueue.length && (
            <div className="lg-callqueue-start">
              <p className="chat-empty-hint">
                {callQueue.length === 0
                  ? "Nincs ma hívásra váró cég."
                  : "Végigértél a mai hívólistán — szép munka!"}
              </p>
              <button type="button" onClick={startCallQueue}>
                Lista frissítése
              </button>
            </div>
          )}

          {callQueue != null && queueIndex < callQueue.length && (
            <>
              <p className="lg-callqueue-progress">
                {queueIndex + 1}/{callQueue.length}
              </p>
              <CallCard
                companyId={callQueue[queueIndex].id}
                onDone={advanceQueue}
                onSkip={() => setQueueIndex((i) => i + 1)}
              />
            </>
          )}
        </>
      )}

      {!loading && tab === "companies" && (
        <>
          {companies.length === 0 && (
            <p className="chat-empty-hint">Nincs még felvett cég — importálj egy CSV-t vagy vegyél fel egyet kézzel.</p>
          )}
          {companies.length > 0 && (
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Cég</th>
                  <th>Iparág</th>
                  <th>Telefon</th>
                  <th>Pontszám</th>
                  <th>Állapot</th>
                  <th>Kísérletek</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} onClick={() => setOpenCompanyId(c.id)} style={{ cursor: "pointer" }}>
                    <td>{c.company_name}</td>
                    <td>{c.industry ?? "—"}</td>
                    <td>{c.phone_main ?? "—"}</td>
                    <td>
                      <span className={`lg-temp-badge lg-temp-badge--${c.lead_temperature}`}>
                        {TEMPERATURE_LABELS[c.lead_temperature]} {c.lead_score}
                      </span>
                    </td>
                    <td>{LEAD_STATUS_LABELS[c.lead_status]}</td>
                    <td>{c.call_attempts_count}/5</td>
                    <td>
                      <button
                        type="button"
                        className="sm-clip-file-remove"
                        onClick={(e) => void handleDeleteCompany(e, c)}
                        aria-label="Eltávolítás"
                        title="Cég eltávolítása a listából"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {!loading && tab === "dnc" && (
        <>
          {dncCompanies.length === 0 && <p className="chat-empty-hint">Nincs egyetlen "ne hívjuk" cég sem.</p>}
          {dncCompanies.length > 0 && (
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Cég</th>
                  <th>Telefon</th>
                  <th>Ok</th>
                  <th>Mikor</th>
                </tr>
              </thead>
              <tbody>
                {dncCompanies.map((c) => (
                  <tr key={c.id}>
                    <td>{c.company_name}</td>
                    <td>{c.phone_main ?? "—"}</td>
                    <td>{c.do_not_call_reason ?? "—"}</td>
                    <td>{c.do_not_call_at ? new Date(c.do_not_call_at).toLocaleDateString("hu-HU") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {showCompanyForm && (
        <CompanyFormModal
          onClose={() => setShowCompanyForm(false)}
          onSaved={() => {
            setShowCompanyForm(false);
            refreshCompanies();
          }}
        />
      )}

      {showCsvImport && (
        <Suspense fallback={null}>
          <CsvImportModal
            onClose={() => setShowCsvImport(false)}
            onImported={() => {
              setShowCsvImport(false);
              refreshCompanies();
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
