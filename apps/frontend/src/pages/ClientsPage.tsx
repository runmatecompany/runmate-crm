import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useNavigation } from "../lib/navigation";
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
  updateClientStatus,
  type Client,
  type ClientFormInput,
  type ClientStatus,
} from "../lib/clients";
import ClientFormModal from "../components/clients/ClientFormModal";
import ClientAiProfileModal from "../components/clients/ClientAiProfileModal";
import ClientOnboardingModal from "../components/clients/ClientOnboardingModal";

const STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Aktív",
  paused: "Szüneteltetve",
  closed: "Lezárva",
};

const CLIENT_TYPE_LABELS: Record<string, string> = {
  monthly: "Havi megújuló",
  one_off: "Alkalmi",
};

export default function ClientsPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";
  const { requestedOnboardingClientId, clearRequestedOnboarding } = useNavigation();

  const [clients, setClients] = useState<Client[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [editingClient, setEditingClient] = useState<Client | "new" | null>(null);
  const [aiProfileClient, setAiProfileClient] = useState<Client | null>(null);
  const [onboardingClient, setOnboardingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    listClients(token)
      .then((result) => {
        setClients(result.clients);
        setHasAccess(result.hasAccess);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Lead→ügyfél konverzió után ide navigálunk vissza egy kérésbe csomagolt
  // ügyfél-azonosítóval (lib/navigation.tsx) — mihelyt a lista betöltődött,
  // automatikusan megnyitjuk rá az Onboarding formot (nem az AI-profilt —
  // azt a hívó kolléga tölti ki élőben, nem feltétlen admin).
  useEffect(() => {
    if (requestedOnboardingClientId == null || clients.length === 0) return;
    const client = clients.find((c) => c.id === requestedOnboardingClientId);
    if (client) setOnboardingClient(client);
    clearRequestedOnboarding();
  }, [requestedOnboardingClientId, clients, clearRequestedOnboarding]);

  async function handleDelete(client: Client) {
    if (!token) return;
    if (!confirm(`Biztosan törlöd a(z) "${client.company_name}" ügyfelet? Ez a hozzá tartozó tartalmakat is törli.`)) return;
    setError(null);
    try {
      await deleteClient(token, client.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült törölni az ügyfelet");
    }
  }

  async function handleSave(input: ClientFormInput) {
    if (!token) return;
    if (editingClient && editingClient !== "new") {
      await updateClient(token, editingClient.id, input);
    } else {
      await createClient(token, input);
    }
    setEditingClient(null);
    refresh();
  }

  async function handleStatusChange(client: Client, status: ClientStatus) {
    if (!token) return;
    setError(null);
    try {
      await updateClientStatus(token, client.id, status);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült frissíteni az ügyfél állapotát");
    }
  }

  if (!loading && !hasAccess) {
    return (
      <main className="leads-page">
        <h1>Ügyfelek</h1>
        <p className="chat-empty-hint">
          Nincs hozzáférésed az Ügyfelek modulhoz. Kérj hozzáférést egy adminisztrátortól.
        </p>
      </main>
    );
  }

  const activeClients = clients.filter((c) => c.status === "active");
  const passiveClients = clients.filter((c) => c.status !== "active");

  function renderTable(list: Client[]) {
    return (
      <table className="leads-table">
        <thead>
          <tr>
            <th>Cég</th>
            <th>Típus</th>
            <th>Állapot</th>
            <th>Kapcsolattartó</th>
            <th>Telefon</th>
            <th>Email</th>
            <th>Drive</th>
            <th>Onboarding</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((client) => {
            const onboarded = client.onboarding_completed_at != null;
            return (
              <tr key={client.id}>
                <td>{client.company_name}</td>
                <td>{client.client_type ? CLIENT_TYPE_LABELS[client.client_type] : "—"}</td>
                <td>
                  <select
                    value={client.status}
                    onChange={(e) => handleStatusChange(client, e.currentTarget.value as ClientStatus)}
                  >
                    {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{client.contact_name}</td>
                <td>{client.phone}</td>
                <td>{client.email}</td>
                <td>
                  {client.drive_folder_id ? (
                    <a
                      href={`https://drive.google.com/drive/folders/${client.drive_folder_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mappa megnyitása
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span
                    className={`sm-kanban-card-badge ${onboarded ? "sm-kanban-card-badge-sent" : "sm-kanban-card-badge-not_started"}`}
                  >
                    {onboarded ? "Kész" : "Hiányzik"}
                  </span>
                </td>
                <td>
                  <div className="leads-row-actions">
                    <button type="button" onClick={() => setEditingClient(client)}>
                      Szerkesztés
                    </button>
                    <button type="button" onClick={() => setOnboardingClient(client)}>
                      {onboarded ? "Onboarding szerkesztése" : "Onboarding"}
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => setAiProfileClient(client)}>
                        AI-profil
                      </button>
                    )}
                    {isAdmin && (
                      <button type="button" onClick={() => handleDelete(client)}>
                        Törlés
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
  }

  return (
    <main className="leads-page">
      <div className="leads-header">
        <h1>Ügyfelek</h1>
      </div>

      {error && <p className="login-error">{error}</p>}
      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {!loading && clients.length === 0 && <p className="chat-empty-hint">Nincs még felvett ügyfél.</p>}

      {!loading && clients.length > 0 && (
        <>
          <h2 className="sm-section-title">Aktív ügyfelek ({activeClients.length})</h2>
          {activeClients.length === 0 ? (
            <p className="chat-empty-hint">Nincs aktív ügyfél.</p>
          ) : (
            renderTable(activeClients)
          )}

          <h2 className="sm-section-title">Passzív ügyfelek ({passiveClients.length})</h2>
          {passiveClients.length === 0 ? (
            <p className="chat-empty-hint">Nincs passzív ügyfél.</p>
          ) : (
            renderTable(passiveClients)
          )}
        </>
      )}

      {editingClient && token && (
        <ClientFormModal
          client={editingClient === "new" ? null : editingClient}
          onClose={() => setEditingClient(null)}
          onSave={handleSave}
        />
      )}

      {aiProfileClient && token && (
        <ClientAiProfileModal
          clientId={aiProfileClient.id}
          clientName={aiProfileClient.company_name}
          onClose={() => {
            setAiProfileClient(null);
            refresh();
          }}
        />
      )}

      {onboardingClient && token && (
        <ClientOnboardingModal
          clientId={onboardingClient.id}
          clientName={onboardingClient.company_name}
          onClose={() => {
            setOnboardingClient(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}
