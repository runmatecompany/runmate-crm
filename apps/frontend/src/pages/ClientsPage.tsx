import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useNavigation } from "../lib/navigation";
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
  type Client,
  type ClientFormInput,
} from "../lib/clients";
import ClientFormModal from "../components/clients/ClientFormModal";
import ClientAiProfileModal from "../components/clients/ClientAiProfileModal";

export default function ClientsPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";
  const { requestedOnboardingClientId, clearRequestedOnboarding } = useNavigation();

  const [clients, setClients] = useState<Client[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [editingClient, setEditingClient] = useState<Client | "new" | null>(null);
  const [aiProfileClient, setAiProfileClient] = useState<Client | null>(null);
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
  // automatikusan megnyitjuk rá az onboarding (AI-profil) formot.
  useEffect(() => {
    if (requestedOnboardingClientId == null || clients.length === 0) return;
    const client = clients.find((c) => c.id === requestedOnboardingClientId);
    if (client) setAiProfileClient(client);
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

  return (
    <main className="leads-page">
      <div className="leads-header">
        <h1>Ügyfelek</h1>
      </div>

      {error && <p className="login-error">{error}</p>}
      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {!loading && clients.length === 0 && <p className="chat-empty-hint">Nincs még felvett ügyfél.</p>}

      {!loading && clients.length > 0 && (
        <table className="leads-table">
          <thead>
            <tr>
              <th>Cég</th>
              <th>Kapcsolattartó</th>
              <th>Telefon</th>
              <th>Email</th>
              <th>Drive</th>
              <th>Onboarding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const onboarded = client.onboarding_completed_at != null;
              return (
                <tr key={client.id}>
                  <td>{client.company_name}</td>
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
                      {isAdmin && (
                        <button type="button" onClick={() => setAiProfileClient(client)}>
                          {onboarded ? "AI-profil szerkesztése" : "Onboarding"}
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
    </main>
  );
}
