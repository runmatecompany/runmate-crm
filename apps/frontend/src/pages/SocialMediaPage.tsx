import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listClients, type Client } from "../lib/clients";
import { createContentItem, listContentItems, type ContentItem, type ContentType } from "../lib/socialMedia";
import KanbanBoard from "../components/socialMedia/KanbanBoard";
import ContentItemDetail from "../components/socialMedia/ContentItemDetail";
import ContentItemFormModal from "../components/socialMedia/ContentItemFormModal";
import PostQueueView from "../components/socialMedia/PostQueueView";
import ShootCalendar from "../components/socialMedia/ShootCalendar";
import ContentCalendar from "../components/socialMedia/ContentCalendar";
import DriveView from "../components/socialMedia/DriveView";
import SocialMediaStatusView from "../components/socialMedia/SocialMediaStatusView";

export type SocialMediaTab = "status" | "kanban" | "post-queue" | "shoot-calendar" | "content-calendar" | "drive";

const TAB_LABELS: Record<SocialMediaTab, string> = {
  status: "Állapot",
  kanban: "Content",
  "post-queue": "Posztolni valók",
  "shoot-calendar": "Forgatási naptár",
  "content-calendar": "Tartalomnaptár",
  drive: "Drive",
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
  }, [token]);

  async function handleCreate(input: {
    clientId: number;
    title: string;
    contentType: ContentType;
    platform: ContentItem["platform"];
    assignedTo?: number;
  }) {
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
        {tab !== "drive" && (
          <button type="button" onClick={() => setShowCreate(true)}>
            + Új tartalom
          </button>
        )}
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && tab === "status" && <SocialMediaStatusView clients={clients} items={items} onOpen={setOpenItemId} />}
      {!loading && tab === "kanban" && <KanbanBoard items={items} onOpen={setOpenItemId} onChanged={refresh} />}
      {!loading && tab === "post-queue" && <PostQueueView items={items} onOpen={setOpenItemId} onChanged={refresh} />}
      {!loading && tab === "shoot-calendar" && <ShootCalendar items={items} onOpen={setOpenItemId} />}
      {!loading && tab === "content-calendar" && <ContentCalendar items={items} onOpen={setOpenItemId} />}
      {!loading && tab === "drive" && <DriveView />}

      {showCreate && (
        <ContentItemFormModal clients={clients} onClose={() => setShowCreate(false)} onSave={handleCreate} />
      )}
    </main>
  );
}
