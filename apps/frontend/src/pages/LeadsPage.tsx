import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useNavigation } from "../lib/navigation";
import {
  LEAD_STATUS_LABELS,
  convertLeadToClient,
  createLead,
  deleteLead,
  listLeads,
  updateLead,
  updateLeadStatus,
  type Lead,
  type LeadFormInput,
  type LeadStatus,
} from "../lib/leads";
import { createManualTask } from "../lib/tasks";
import Avatar from "../components/Avatar";
import LeadFormModal from "../components/leads/LeadFormModal";
import LeadDetail from "../components/leads/LeadDetail";
import LeadInterestedNoteModal from "../components/leads/LeadInterestedNoteModal";
import LeadCallbackModal from "../components/leads/LeadCallbackModal";
import LeadNotInterestedNoteModal from "../components/leads/LeadNotInterestedNoteModal";
import LeadAuditModal from "../components/leads/LeadAuditModal";
import LeadMeetingModal from "../components/leads/LeadMeetingModal";
import LeadDriveLinkModal from "../components/leads/LeadDriveLinkModal";

// A HR pipeline oszlopai — a "became_customer" szándékosan nincs itt: az
// invoice_sent lépés után a lead automatikusan ügyféllé alakul (lásd
// handleSaveInvoice), nincs többé kézzel választható "Ügyfél lett" oszlop.
const STATUS_ORDER: LeadStatus[] = [
  "to_call",
  "call_back",
  "interested",
  "audit",
  "meeting_scheduled",
  "contract_sent",
  "invoice_sent",
  "not_interested",
];

// A korai szakaszban (Megkeresendő/Visszahívandó/Érdekli) bármelyik
// következő lépésre válthat a lead — ugyanaz a rugalmasság, mint a régi
// lapos állapot-legördülőnél volt, csak most gombokként.
const EARLY_STAGE_STATUSES: LeadStatus[] = ["to_call", "call_back", "interested"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("hu-HU");
}

export default function LeadsPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";
  const { openClientOnboarding } = useNavigation();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [search, setSearch] = useState("");
  const [editingLead, setEditingLead] = useState<Lead | "new" | null>(null);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [interestedNoteLead, setInterestedNoteLead] = useState<Lead | null>(null);
  const [callbackLead, setCallbackLead] = useState<Lead | null>(null);
  const [notInterestedLead, setNotInterestedLead] = useState<Lead | null>(null);
  const [auditLead, setAuditLead] = useState<Lead | null>(null);
  const [meetingLead, setMeetingLead] = useState<Lead | null>(null);
  const [contractLead, setContractLead] = useState<Lead | null>(null);
  const [invoiceLead, setInvoiceLead] = useState<Lead | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    listLeads(token)
      .then((result) => {
        setLeads(result.leads);
        setHasAccess(result.hasAccess);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter(
      (l) =>
        l.company_name.toLowerCase().includes(term) ||
        (l.city ?? "").toLowerCase().includes(term) ||
        (l.contact_name ?? "").toLowerCase().includes(term)
    );
  }, [leads, search]);

  async function handleSimpleStatus(lead: Lead, status: LeadStatus) {
    if (!token) return;
    setError(null);
    try {
      await updateLeadStatus(token, lead.id, status);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült frissíteni az állapotot");
    }
  }

  async function handleSaveNotInterested(note: string) {
    if (!token || !notInterestedLead) return;
    await updateLeadStatus(token, notInterestedLead.id, "not_interested", { note });
    setNotInterestedLead(null);
    refresh();
  }

  // "Visszahívandó"-ra váltáskor a dátum + jegyzet mellett automatikusan
  // létrejön egy emlékeztető feladat is a Feladatok modulban.
  async function handleSaveCallback(dueDate: string, note: string) {
    if (!token || !callbackLead) return;
    const formattedDate = new Date(dueDate).toLocaleDateString("hu-HU");
    const statusNote = `Visszahívás időpontja: ${formattedDate}${note ? ` — ${note}` : ""}`;
    await updateLeadStatus(token, callbackLead.id, "call_back", { note: statusNote });
    await createManualTask(token, {
      title: `Visszahívás: ${callbackLead.company_name}`,
      description: [callbackLead.phone ? `Telefon: ${callbackLead.phone}` : null, note || null]
        .filter(Boolean)
        .join("\n"),
      assignedTo: auth?.user.id,
      dueDate,
    });
    setCallbackLead(null);
    refresh();
  }

  async function handleSaveInterestedNote(note: string) {
    if (!token || !interestedNoteLead) return;
    await updateLeadStatus(token, interestedNoteLead.id, "interested", { note });
    setInterestedNoteLead(null);
    refresh();
  }

  // Audit kimenete dönti el a következő állapotot: sikeres → Tárgyalásra
  // vár, sikertelen → Nem érdekli.
  async function handleSaveAudit(outcome: "success" | "fail", note: string) {
    if (!token || !auditLead) return;
    const statusNote = `Audit (${outcome === "success" ? "sikeres" : "sikertelen"})${note ? `: ${note}` : ""}`;
    await updateLeadStatus(token, auditLead.id, outcome === "success" ? "meeting_scheduled" : "not_interested", {
      note: statusNote,
    });
    setAuditLead(null);
    refresh();
  }

  // A tárgyalás dátuma emlékeztető feladatot is létrehoz — ugyanaz a minta,
  // mint a Visszahívandónál — de az állapot marad meeting_scheduled, a
  // Szerződés kiküldése külön lépés, miután a tárgyalás megtörtént.
  async function handleSaveMeeting(meetingDate: string, note: string) {
    if (!token || !meetingLead) return;
    const formattedDate = new Date(meetingDate).toLocaleDateString("hu-HU");
    const statusNote = `Tárgyalás időpontja: ${formattedDate}${note ? ` — ${note}` : ""}`;
    await updateLeadStatus(token, meetingLead.id, "meeting_scheduled", { note: statusNote, meetingDate });
    await createManualTask(token, {
      title: `Tárgyalás: ${meetingLead.company_name}`,
      description: [meetingLead.phone ? `Telefon: ${meetingLead.phone}` : null, note || null]
        .filter(Boolean)
        .join("\n"),
      assignedTo: auth?.user.id,
      dueDate: meetingDate,
    });
    setMeetingLead(null);
    refresh();
  }

  async function handleSaveContract(driveLink: string) {
    if (!token || !contractLead) return;
    const result = await updateLeadStatus(token, contractLead.id, "contract_sent", { contractDriveLink: driveLink });
    setContractLead(null);
    refresh();
    if (result.emailSent === false) {
      alert("A szerződés-link elmentve, de az emailt nem sikerült kiküldeni (nincs email cím vagy nincs beállítva küldő fiók).");
    }
  }

  // Számlázás mentése után a lead automatikusan ügyféllé alakul (a
  // meglévő convertLeadToClient-tel, ugyanaz, mint a régi kézi "Ügyféllé
  // alakítás" gomb csinálta), majd egyből megnyílik neki az Onboarding —
  // ha a konverzió duplikáció miatt elbukik, a lead invoice_sent
  // állapotban marad, a kártyán megjelenő "Ügyféllé alakítás" gombbal
  // később manuálisan újrapróbálható.
  async function handleSaveInvoice(driveLink: string) {
    if (!token || !invoiceLead) return;
    const result = await updateLeadStatus(token, invoiceLead.id, "invoice_sent", { invoiceDriveLink: driveLink });
    setInvoiceLead(null);
    if (result.emailSent === false) {
      alert("A számla-link elmentve, de az emailt nem sikerült kiküldeni (nincs email cím vagy nincs beállítva küldő fiók).");
    }
    await handleConvert(result.lead, true);
  }

  async function handleConvert(lead: Lead, silent = false) {
    if (!token) return;
    if (
      !silent &&
      !confirm(
        `"${lead.company_name}" átkerül az Ügyfelek közé (a kutatásnál megadott weboldal/social linkekkel együtt), és eltűnik a Leadek listából. Folytatod?`
      )
    ) {
      return;
    }
    let clientId: number;
    try {
      clientId = await convertLeadToClient(token, lead.id);
    } catch (err) {
      if (!silent) alert(err instanceof Error ? err.message : "Nem sikerült ügyféllé alakítani a leadet");
      refresh();
      return;
    }
    refresh();
    // Az AI-profil (onboarding-kérdőív) kitöltése admin-only, ezért csak
    // adminnak nyitjuk meg automatikusan — máskülönben úgyis 403-at kapna
    // mentéskor.
    if (isAdmin) {
      openClientOnboarding(clientId);
    } else {
      alert(`"${lead.company_name}" ügyfélként létrejött. Kérj meg egy adminisztrátort, hogy töltse ki az AI-profilját.`);
    }
  }

  async function handleDelete(lead: Lead) {
    if (!token) return;
    if (!confirm(`Biztosan törlöd a(z) "${lead.company_name}" leadet?`)) return;
    await deleteLead(token, lead.id);
    refresh();
  }

  async function handleSave(input: LeadFormInput) {
    if (!token) return;
    if (editingLead && editingLead !== "new") {
      await updateLead(token, editingLead.id, input);
    } else {
      await createLead(token, input);
    }
    setEditingLead(null);
    refresh();
  }

  if (!loading && !hasAccess) {
    return (
      <main className="leads-page">
        <h1>HR</h1>
        <p className="chat-empty-hint">Nincs hozzáférésed a HR modulhoz. Kérj hozzáférést egy adminisztrátortól.</p>
      </main>
    );
  }

  const openLead = openLeadId != null ? leads.find((l) => l.id === openLeadId) : undefined;
  if (openLead) {
    return (
      <main className="leads-page sm-page">
        <LeadDetail lead={openLead} onBack={() => setOpenLeadId(null)} onChanged={refresh} />
      </main>
    );
  }

  function renderCardActions(lead: Lead) {
    if (EARLY_STAGE_STATUSES.includes(lead.status)) {
      return (
        <>
          <button type="button" onClick={() => setCallbackLead(lead)}>
            Visszahívandó
          </button>
          <button type="button" onClick={() => setInterestedNoteLead(lead)}>
            Érdekli
          </button>
          <button type="button" onClick={() => void handleSimpleStatus(lead, "audit")}>
            Audit
          </button>
          <button type="button" onClick={() => setNotInterestedLead(lead)}>
            Nem érdekli
          </button>
        </>
      );
    }
    if (lead.status === "audit") {
      return (
        <button type="button" onClick={() => setAuditLead(lead)}>
          Audit lezárása
        </button>
      );
    }
    if (lead.status === "meeting_scheduled") {
      return lead.meeting_date ? (
        <button type="button" onClick={() => setContractLead(lead)}>
          Szerződés kiküldése
        </button>
      ) : (
        <button type="button" onClick={() => setMeetingLead(lead)}>
          Tárgyalás időpontja
        </button>
      );
    }
    if (lead.status === "contract_sent") {
      return (
        <button type="button" onClick={() => setInvoiceLead(lead)}>
          Számlázás
        </button>
      );
    }
    if (lead.status === "invoice_sent") {
      return (
        <button type="button" onClick={() => void handleConvert(lead)}>
          Ügyféllé alakítás
        </button>
      );
    }
    return null;
  }

  return (
    <main className="leads-page">
      <div className="leads-header">
        <h1>HR</h1>
        <button type="button" onClick={() => setEditingLead("new")}>
          + Új lead
        </button>
      </div>

      <div className="mt-toolbar">
        <input
          type="text"
          className="mt-search"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Keresés cégnév, város, kapcsolattartó szerint..."
        />
      </div>

      {error && <p className="login-error">{error}</p>}
      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && (
        <div className="sm-kanban">
          {STATUS_ORDER.map((status) => {
            const columnLeads = filteredLeads.filter((l) => l.status === status);
            return (
              <div key={status} className="sm-kanban-col">
                <div className="sm-kanban-col-header">
                  <span>{LEAD_STATUS_LABELS[status]}</span>
                  <span className="sm-kanban-col-count">{columnLeads.length}</span>
                </div>
                <div className="sm-kanban-col-body">
                  {columnLeads.map((lead) => (
                    <div key={lead.id} className="sm-kanban-card mt-card">
                      <button type="button" className="mt-card-body" onClick={() => setEditingLead(lead)}>
                        <div className="mt-card-tags">
                          {lead.city && <span className="mt-client-pill">{lead.city}</span>}
                        </div>
                        <div className="mt-card-title">{lead.company_name}</div>
                        {lead.contact_name && <div className="mt-card-desc">{lead.contact_name}</div>}
                        {lead.phone && <div className="mt-card-desc">{lead.phone}</div>}
                        {lead.meeting_date && lead.status === "meeting_scheduled" && (
                          <div className="mt-card-meta">Tárgyalás: {formatDate(lead.meeting_date)}</div>
                        )}
                        {lead.contract_drive_link && lead.status !== "to_call" && (
                          <a
                            href={lead.contract_drive_link}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-card-desc"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Szerződés
                          </a>
                        )}
                        {lead.invoice_drive_link && (
                          <a
                            href={lead.invoice_drive_link}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-card-desc"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Számla
                          </a>
                        )}
                        {lead.created_by != null && lead.created_by_name && (
                          <div className="mt-card-footer">
                            <Avatar userId={lead.created_by} name={lead.created_by_name} size={20} />
                            <span>{lead.created_by_name}</span>
                          </div>
                        )}
                      </button>
                      <div className="mt-card-actions">
                        {renderCardActions(lead)}
                        <button type="button" onClick={() => setOpenLeadId(lead.id)}>
                          Kutatás
                        </button>
                        {isAdmin && (
                          <button type="button" className="mt-action-danger" onClick={() => void handleDelete(lead)}>
                            Törlés
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {columnLeads.length === 0 && <p className="sm-kanban-col-empty">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingLead && token && (
        <LeadFormModal
          lead={editingLead === "new" ? null : editingLead}
          token={token}
          onClose={() => setEditingLead(null)}
          onSave={handleSave}
        />
      )}

      {interestedNoteLead && (
        <LeadInterestedNoteModal
          companyName={interestedNoteLead.company_name}
          onClose={() => setInterestedNoteLead(null)}
          onSave={handleSaveInterestedNote}
        />
      )}

      {callbackLead && (
        <LeadCallbackModal
          companyName={callbackLead.company_name}
          onClose={() => setCallbackLead(null)}
          onSave={handleSaveCallback}
        />
      )}

      {notInterestedLead && (
        <LeadNotInterestedNoteModal
          companyName={notInterestedLead.company_name}
          onClose={() => setNotInterestedLead(null)}
          onSave={handleSaveNotInterested}
        />
      )}

      {auditLead && (
        <LeadAuditModal companyName={auditLead.company_name} onClose={() => setAuditLead(null)} onSave={handleSaveAudit} />
      )}

      {meetingLead && (
        <LeadMeetingModal
          companyName={meetingLead.company_name}
          onClose={() => setMeetingLead(null)}
          onSave={handleSaveMeeting}
        />
      )}

      {contractLead && (
        <LeadDriveLinkModal
          companyName={contractLead.company_name}
          kind="contract"
          hasEmail={Boolean(contractLead.email)}
          onClose={() => setContractLead(null)}
          onSave={handleSaveContract}
        />
      )}

      {invoiceLead && (
        <LeadDriveLinkModal
          companyName={invoiceLead.company_name}
          kind="invoice"
          hasEmail={Boolean(invoiceLead.email)}
          onClose={() => setInvoiceLead(null)}
          onSave={handleSaveInvoice}
        />
      )}
    </main>
  );
}
