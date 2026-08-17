import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listTasks, type ClientTaskSummary } from "../lib/tasks";
import { CONTENT_STATUS_LABELS, PLATFORM_LABELS, type ContentItem } from "../lib/socialMedia";

function isThisMonth(value: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function progressLabel(done: number, target: number | null): string {
  return target != null ? `${done}/${target} kész` : `${done} kész`;
}

export default function TasksPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [clients, setClients] = useState<ClientTaskSummary[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openClientId, setOpenClientId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    listTasks(token)
      .then((result) => {
        setClients(result.clients);
        setItems(result.items);
        setHasAccess(result.hasAccess);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (!loading && !hasAccess) {
    return (
      <main className="leads-page">
        <h1>Feladatok</h1>
        <p className="chat-empty-hint">
          Nincs hozzáférésed a Feladatok modulhoz. Kérj hozzáférést egy adminisztrátortól.
        </p>
      </main>
    );
  }

  return (
    <main className="leads-page sm-page">
      <div className="leads-header">
        <h1>Feladatok</h1>
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {!loading && clients.length === 0 && <p className="chat-empty-hint">Nincs még felvett ügyfél.</p>}

      {!loading &&
        clients.map((client) => {
          const clientItems = items.filter((i) => i.client_id === client.client_id);
          const videoDone = clientItems.filter(
            (i) => i.content_type === "video" && i.status === "published" && isThisMonth(i.published_at)
          ).length;
          const postDone = clientItems.filter(
            (i) => i.content_type === "image_post" && i.status === "published" && isThisMonth(i.published_at)
          ).length;
          const inProgress = clientItems.filter((i) => i.status !== "published");
          const isOpen = openClientId === client.client_id;

          return (
            <div key={client.client_id} className="sm-detail" style={{ marginBottom: "1em" }}>
              <button
                type="button"
                className="sm-detail-back"
                onClick={() => setOpenClientId(isOpen ? null : client.client_id)}
              >
                {isOpen ? "▾" : "▸"} {client.client_name}
              </button>
              <p className="sm-detail-sub">
                Videó: {progressLabel(videoDone, client.monthly_video_target)} ebben a hónapban · Képes poszt:{" "}
                {progressLabel(postDone, client.monthly_post_target)} ebben a hónapban
              </p>

              {isOpen && (
                <>
                  {inProgress.length === 0 && <p className="chat-empty-hint">Nincs folyamatban lévő tartalom.</p>}
                  <ul className="sm-approval-history">
                    {inProgress.map((item) => (
                      <li key={item.id} className="sm-approval-history-item">
                        <div>
                          <strong>{item.title}</strong> — {CONTENT_STATUS_LABELS[item.status]}
                        </div>
                        <div className="sm-approval-history-meta">
                          {item.content_type === "video" ? "Videó" : "Képes poszt"} · {PLATFORM_LABELS[item.platform]}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
    </main>
  );
}
