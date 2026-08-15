import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
  type Client,
  type ClientFormInput,
} from "../lib/clients";
import ClientFormModal from "../components/clients/ClientFormModal";

export default function ClientsPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";

  const [clients, setClients] = useState<Client[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [editingClient, setEditingClient] = useState<Client | "new" | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function handleDelete(client: Client) {
    if (!token) return;
    if (!confirm(`Biztosan törlöd a(z) "${client.company_name}" ügyfelet?`)) return;
    await deleteClient(token, client.id);
    refresh();
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
        <button type="button" onClick={() => setEditingClient("new")}>
          + Új ügyfél
        </button>
      </div>

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>{client.company_name}</td>
                <td>{client.contact_name}</td>
                <td>{client.phone}</td>
                <td>{client.email}</td>
                <td>
                  <div className="leads-row-actions">
                    <button type="button" onClick={() => setEditingClient(client)}>
                      Szerkesztés
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => handleDelete(client)}>
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

      {editingClient && token && (
        <ClientFormModal
          client={editingClient === "new" ? null : editingClient}
          onClose={() => setEditingClient(null)}
          onSave={handleSave}
        />
      )}
    </main>
  );
}
