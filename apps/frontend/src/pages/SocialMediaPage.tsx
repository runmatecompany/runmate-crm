import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listClients, type Client } from "../lib/clients";
import { listColleagues, type Colleague } from "../lib/chat";
import { createContentItem, listContentItems, type ContentItem } from "../lib/socialMedia";
import KanbanBoard from "../components/socialMedia/KanbanBoard";
import ContentItemDetail from "../components/socialMedia/ContentItemDetail";
import ContentItemFormModal from "../components/socialMedia/ContentItemFormModal";
import ApprovalQueueView from "../components/socialMedia/ApprovalQueueView";
import ShootCalendar from "../components/socialMedia/ShootCalendar";
import ContentCalendar from "../components/socialMedia/ContentCalendar";

export type SocialMediaTab = "kanban" | "queue" | "shoot-calendar" | "content-calendar";

const TAB_LABELS: Record<SocialMediaTab, string> = {
  kanban: "Folyamat",
  queue: "Jóváhagyásra vár",
  "shoot-calendar": "Forgatási naptár",
  "content-calendar": "Tartalomnaptár",
};

interface SocialMediaPageProps {
  tab: SocialMediaTab;
}

export default function SocialMediaPage({ tab }: SocialMediaPageProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openItemId, setOpenItemId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    listContentItems(token)
      .then((result) => {
        setItems(result.items);
        setHasAccess(result.hasAccess);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Ha a felhasználó egy másik almenüpontra vált, miközben egy tartalom
  // részletes nézetét látja, ne maradjon ott — kövesse az új fület.
  useEffect(() => {
    setOpenItemId(null);
  }, [tab]);

  useEffect(() => {
    if (!token) return;
    listClients(token).then((result) => setClients(result.clients));
    listColleagues(token).then(setColleagues);
  }, [token]);

  async function handleCreate(input: { clientId: number; title: string; platform: ContentItem["platform"]; assignedTo?: number }) {
    if (!token) return;
    await createContentItem(token, input);
    setShowCreate(false);
    refresh();
  }

  if (!loading && !hasAccess) {
    return (
      <main className="leads-page">
        <h1>Social Media</h1>
        <p className="chat-empty-hint">
          Nincs hozzáférésed a Social Media modulhoz. Kérj hozzáférést egy adminisztrátortól.
        </p>
      </main>
    );
  }

  if (openItemId != null) {
    return (
      <main className="leads-page sm-page">
        <ContentItemDetail
          itemId={openItemId}
          onBack={() => setOpenItemId(null)}
          onChanged={refresh}
        />
      </main>
    );
  }

  return (
    <main className="leads-page sm-page">
      <div className="leads-header">
        <h1>Social Media — {TAB_LABELS[tab]}</h1>
        <button type="button" onClick={() => setShowCreate(true)}>
          + Új tartalom
        </button>
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && tab === "kanban" && <KanbanBoard items={items} onOpen={setOpenItemId} onChanged={refresh} />}
      {!loading && tab === "queue" && <ApprovalQueueView onOpen={setOpenItemId} />}
      {!loading && tab === "shoot-calendar" && <ShootCalendar items={items} onOpen={setOpenItemId} />}
      {!loading && tab === "content-calendar" && <ContentCalendar items={items} onOpen={setOpenItemId} />}

      {showCreate && (
        <ContentItemFormModal
          clients={clients}
          colleagues={colleagues}
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
    </main>
  );
}
