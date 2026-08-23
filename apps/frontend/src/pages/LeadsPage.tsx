import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
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
import LeadAuditView from "../components/leads/LeadAuditView";
import LeadMeetingModal from "../components/leads/LeadMeetingModal";
import LeadNotInterestedNoteModal from "../components/leads/LeadNotInterestedNoteModal";
import LeadCallbackReasonModal from "../components/leads/LeadCallbackReasonModal";

// Az Értékesítés pipeline oszlopai. A "call_back" bármelyik nem-lezárt
// lépésről felvehető univerzális "most nem értem el" jelölés — nincs saját
// "belépési" nyila a diagramon, bármelyik más lépésről elérhető, és onnan
// Audit / Tárgyalásra vár / Nem érdekli felé lép tovább.
const STATUS_ORDER: LeadStatus[] = [
  "to_call",
  "call_back",
  "audit",
  "meeting_scheduled",
  "decision_pending",
  "accepted",
  "not_interested",
  "declined",
];

const CLOSED_STATUSES: LeadStatus[] = ["not_interested", "declined"];

interface DeclineTarget {
  lead: Lead;
  status: "not_interested" | "declined";
  title: string;
}

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

  const [declineTarget, setDeclineTarget] = useState<DeclineTarget | null>(null);
  const [callbackLead, setCallbackLead] = useState<Lead | null>(null);
  const [meetingLead, setMeetingLead] = useState<Lead | null>(null);

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

  async function handleSaveDecline(note: string) {
    if (!token || !declineTarget) return;
    await updateLeadStatus(token, declineTarget.lead.id, declineTarget.status, { note });
    setDeclineTarget(null);
    refresh();
  }

  async function handleSaveCallbackReason(reason: string) {
    if (!token || !callbackLead) return;
    await updateLeadStatus(token, callbackLead.id, "call_back", { callBackReason: reason });
    setCallbackLead(null);
    refresh();
  }

  // A tárgyalás időpontja/címe mentése emlékeztető feladatot is létrehoz a
  // Feladatok modulban, majd a lead egyben "decision_pending" állapotba kerül.
  async function handleSaveMeeting(meetingDate: string, address: string) {
    if (!token || !meetingLead) return;
    await updateLeadStatus(token, meetingLead.id, "decision_pending", { meetingDate, address });
    await createManualTask(token, {
      title: `Tárgyalás: ${meetingLead.company_name}`,
      description: [address ? `Helyszín: ${address}` : null, meetingLead.phone ? `Telefon: ${meetingLead.phone}` : null]
        .filter(Boolean)
        .join("\n"),
      assignedTo: auth?.user.id,
      dueDate: meetingDate,
    });
    setMeetingLead(null);
    refresh();
  }

  async function handleConvert(lead: Lead) {
    if (!token) return;
    if (
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
      alert(err instanceof Error ? err.message : "Nem sikerült ügyféllé alakítani a leadet");
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
        <h1>Értékesítés</h1>
        <p className="chat-empty-hint">Nincs hozzáférésed az Értékesítés modulhoz. Kérj hozzáférést egy adminisztrátortól.</p>
      </main>
    );
  }

  const openLead = openLeadId != null ? leads.find((l) => l.id === openLeadId) : undefined;
  if (openLead) {
    return (
      <main className="leads-page sm-page">
        <LeadAuditView lead={openLead} onBack={() => setOpenLeadId(null)} onChanged={refresh} />
      </main>
    );
  }

  function renderCardActions(lead: Lead) {
    const buttons: ReactElement[] = [];

    if (lead.status === "to_call") {
      buttons.push(
        <button key="interested" type="button" onClick={() => void handleSimpleStatus(lead, "audit")}>
          Érdekli
        </button>
      );
      buttons.push(
        <button
          key="not-interested"
          type="button"
          onClick={() => setDeclineTarget({ lead, status: "not_interested", title: "Nem érdekli" })}
        >
          Nem érdekli
        </button>
      );
    } else if (lead.status === "call_back") {
      buttons.push(
        <button key="audit" type="button" onClick={() => void handleSimpleStatus(lead, "audit")}>
          Audit
        </button>
      );
      buttons.push(
        <button key="meeting" type="button" onClick={() => void handleSimpleStatus(lead, "meeting_scheduled")}>
          Tárgyalásra vár
        </button>
      );
      buttons.push(
        <button
          key="not-interested"
          type="button"
          onClick={() => setDeclineTarget({ lead, status: "not_interested", title: "Nem érdekli" })}
        >
          Nem érdekli
        </button>
      );
    } else if (lead.status === "audit") {
      buttons.push(
        <button key="open-audit" type="button" onClick={() => setOpenLeadId(lead.id)}>
          Audit megnyitása
        </button>
      );
    } else if (lead.status === "meeting_scheduled") {
      buttons.push(
        <button key="meeting-details" type="button" onClick={() => setMeetingLead(lead)}>
          Időpont / Cím
        </button>
      );
      buttons.push(
        <button
          key="not-interested"
          type="button"
          onClick={() => setDeclineTarget({ lead, status: "not_interested", title: "Nem érdekli" })}
        >
          Nem érdekli
        </button>
      );
    } else if (lead.status === "decision_pending") {
      buttons.push(
        <button key="accepted" type="button" onClick={() => void handleSimpleStatus(lead, "accepted")}>
          Elfogadta
        </button>
      );
      buttons.push(
        <button
          key="declined"
          type="button"
          onClick={() => setDeclineTarget({ lead, status: "declined", title: "Nemet mondott" })}
        >
          Nemet mondott
        </button>
      );
    } else if (lead.status === "accepted") {
      buttons.push(
        <button key="onboarding" type="button" onClick={() => void handleConvert(lead)}>
          Onboarding megkezdése
        </button>
      );
    }

    if (lead.status !== "call_back" && !CLOSED_STATUSES.includes(lead.status)) {
      buttons.push(
        <button key="callback" type="button" onClick={() => setCallbackLead(lead)}>
          Visszahívandó
        </button>
      );
    }

    if (isAdmin) {
      buttons.push(
        <button key="delete" type="button" className="mt-action-danger" onClick={() => void handleDelete(lead)}>
          Törlés
        </button>
      );
    }

    return buttons;
  }

  return (
    <main className="leads-page">
      <div className="leads-header">
        <h1>Értékesítés</h1>
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
                        {lead.contact_name && (
                          <div className="mt-card-desc">
                            {lead.contact_name}
                            {lead.contact_position ? ` (${lead.contact_position})` : ""}
                          </div>
                        )}
                        {lead.phone && <div className="mt-card-desc">{lead.phone}</div>}
                        {lead.status === "call_back" && lead.call_back_reason && (
                          <div className="mt-card-meta">Ok: {lead.call_back_reason}</div>
                        )}
                        {lead.meeting_date && (lead.status === "meeting_scheduled" || lead.status === "decision_pending") && (
                          <div className="mt-card-meta">
                            Tárgyalás: {formatDate(lead.meeting_date)}
                            {lead.address ? ` · ${lead.address}` : ""}
                          </div>
                        )}
                        {lead.created_by != null && lead.created_by_name && (
                          <div className="mt-card-footer">
                            <Avatar userId={lead.created_by} name={lead.created_by_name} size={20} />
                            <span>{lead.created_by_name}</span>
                          </div>
                        )}
                      </button>
                      <div className="mt-card-actions">{renderCardActions(lead)}</div>
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

      {declineTarget && (
        <LeadNotInterestedNoteModal
          companyName={declineTarget.lead.company_name}
          title={declineTarget.title}
          onClose={() => setDeclineTarget(null)}
          onSave={handleSaveDecline}
        />
      )}

      {callbackLead && (
        <LeadCallbackReasonModal
          companyName={callbackLead.company_name}
          onClose={() => setCallbackLead(null)}
          onSave={handleSaveCallbackReason}
        />
      )}

      {meetingLead && (
        <LeadMeetingModal lead={meetingLead} onClose={() => setMeetingLead(null)} onSave={handleSaveMeeting} />
      )}
    </main>
  );
}
