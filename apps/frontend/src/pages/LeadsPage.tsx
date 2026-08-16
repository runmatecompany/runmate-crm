import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useNavigation } from "../lib/navigation";
import {
  LEAD_STATUS_OPTIONS,
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
import LeadFormModal from "../components/leads/LeadFormModal";
import LeadDetail from "../components/leads/LeadDetail";

export default function LeadsPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";
  const { openClientOnboarding } = useNavigation();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [editingLead, setEditingLead] = useState<Lead | "new" | null>(null);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    if (!token) return;
    await updateLeadStatus(token, lead.id, status);
    refresh();
  }

  async function handleConvert(lead: Lead) {
    if (!token) return;
    if (!confirm(`"${lead.company_name}" átkerül az Ügyfelek közé, és a lead állapota "Ügyfél lett"-re vált. Folytatod?`)) {
      return;
    }
    const clientId = await convertLeadToClient(token, lead.id);
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
        <h1>Leadek</h1>
        <p className="chat-empty-hint">
          Nincs hozzáférésed a Leadek modulhoz. Kérj hozzáférést egy adminisztrátortól.
        </p>
      </main>
    );
  }

  const openLead = openLeadId != null ? leads.find((l) => l.id === openLeadId) : undefined;
  if (openLead) {
    return (
      <main className="leads-page sm-page">
        <LeadDetail lead={openLead} onBack={() => setOpenLeadId(null)} />
      </main>
    );
  }

  const visible = leads.filter((l) => statusFilter === "all" || l.status === statusFilter);

  return (
    <main className="leads-page">
      <div className="leads-header">
        <h1>Leadek</h1>
        <button type="button" onClick={() => setEditingLead("new")}>
          + Új lead
        </button>
      </div>

      <div className="leads-status-tabs">
        <button
          type="button"
          className={statusFilter === "all" ? "leads-status-tab active" : "leads-status-tab"}
          onClick={() => setStatusFilter("all")}
        >
          Összes ({leads.length})
        </button>
        {LEAD_STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={statusFilter === opt.value ? "leads-status-tab active" : "leads-status-tab"}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label} ({leads.filter((l) => l.status === opt.value).length})
          </button>
        ))}
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {!loading && visible.length === 0 && <p className="chat-empty-hint">Nincs megjeleníthető lead.</p>}

      {!loading && visible.length > 0 && (
        <table className="leads-table">
          <thead>
            <tr>
              <th>Cég</th>
              <th>Kapcsolattartó</th>
              <th>Telefon</th>
              <th>Email</th>
              <th>Állapot</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((lead) => (
              <tr key={lead.id}>
                <td>{lead.company_name}</td>
                <td>{lead.contact_name}</td>
                <td>{lead.phone}</td>
                <td>{lead.email}</td>
                <td>
                  <select
                    className={`leads-status-select leads-status-${lead.status}`}
                    value={lead.status}
                    onChange={(e) => handleStatusChange(lead, e.currentTarget.value as LeadStatus)}
                  >
                    {LEAD_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="leads-row-actions">
                    <button type="button" onClick={() => setOpenLeadId(lead.id)}>
                      Kutatás
                    </button>
                    <button type="button" onClick={() => setEditingLead(lead)}>
                      Szerkesztés
                    </button>
                    {lead.status !== "became_customer" && (
                      <button type="button" onClick={() => handleConvert(lead)}>
                        Ügyféllé alakítás
                      </button>
                    )}
                    {isAdmin && (
                      <button type="button" onClick={() => handleDelete(lead)}>
                        Törlés
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingLead && token && (
        <LeadFormModal
          lead={editingLead === "new" ? null : editingLead}
          token={token}
          onClose={() => setEditingLead(null)}
          onSave={handleSave}
        />
      )}
    </main>
  );
}
