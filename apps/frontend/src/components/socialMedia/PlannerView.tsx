import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import type { Client } from "../../lib/clients";
import {
  DRAFT_TYPE_LABELS,
  createContentDraft,
  listContentDrafts,
  type ContentDraft,
  type DraftType,
} from "../../lib/contentDrafts";
import { PLATFORM_LABELS, type Platform } from "../../lib/socialMedia";
import ContentDraftDetail from "./ContentDraftDetail";
import ContentDraftFormModal from "./ContentDraftFormModal";

interface PlannerViewProps {
  clients: Client[];
}

// Az ügyfél-választás a belépési pont: a jobb oldalon látszó AI-profil
// (ContentDraftDetail-ben) emiatt mindig egyértelmű, kinek készül a terv, és
// a "+ Új terv" is már erre az ügyfélre hozza létre a rekordot.
export default function PlannerView({ clients }: PlannerViewProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [clientId, setClientId] = useState<number | "">(clients[0]?.id ?? "");
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [openDraftId, setOpenDraftId] = useState<number | null>(null);

  useEffect(() => {
    if (clientId === "" && clients[0]) setClientId(clients[0].id);
  }, [clients, clientId]);

  const refresh = useCallback(() => {
    if (!token || clientId === "") return;
    setLoading(true);
    listContentDrafts(token, clientId)
      .then(setDrafts)
      .finally(() => setLoading(false));
  }, [token, clientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setOpenDraftId(null);
  }, [clientId]);

  async function handleCreate(input: { type: DraftType; platform: Platform; title: string; topic?: string }) {
    if (!token || clientId === "") return;
    const draft = await createContentDraft(token, { clientId, ...input });
    setShowCreate(false);
    refresh();
    setOpenDraftId(draft.id);
  }

  if (clients.length === 0) {
    return <p className="chat-empty-hint">Nincs még felvett ügyfél — előbb vegyél fel egyet az Ügyfelek modulban.</p>;
  }

  if (openDraftId != null) {
    return (
      <ContentDraftDetail
        draftId={openDraftId}
        onBack={() => setOpenDraftId(null)}
        onChanged={refresh}
      />
    );
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="sm-planner">
      <div className="sm-planner-toolbar">
        <div>
          <label htmlFor="planner-client">Ügyfél</label>
          <select
            id="planner-client"
            value={clientId}
            onChange={(e) => setClientId(Number(e.currentTarget.value))}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}>
          + Új terv
        </button>
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && drafts.length === 0 && <p className="chat-empty-hint">Ehhez az ügyfélhez még nincs terv.</p>}

      {!loading && drafts.length > 0 && (
        <ul className="sm-drive-list">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <button type="button" className="sm-drive-item" onClick={() => setOpenDraftId(draft.id)}>
                <strong>{DRAFT_TYPE_LABELS[draft.type]}</strong> · {PLATFORM_LABELS[draft.platform]} — {draft.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCreate && selectedClient && (
        <ContentDraftFormModal
          clientName={selectedClient.company_name}
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
    </div>
  );
}
