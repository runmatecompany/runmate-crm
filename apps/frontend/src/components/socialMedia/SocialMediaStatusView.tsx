import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import type { Client } from "../../lib/clients";
import { confirmClippingPayment, getClippingProgress, type ClippingProgress } from "../../lib/clippingProgress";
import { CONTENT_STATUS_LABELS, PLATFORM_LABELS, type ContentItem } from "../../lib/socialMedia";

interface SocialMediaStatusViewProps {
  clients: Client[];
  items: ContentItem[];
  onOpen: (id: number) => void;
}

function isThisMonth(value: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function progressPct(done: number, target: number | null): number {
  if (!target) return 0;
  return Math.min(100, (done / target) * 100);
}

// Mindig nyitott, kattintás nélküli mini-profil ügyfelenként — ellentétben
// a Feladatok modullal, ami külön modul-jogosultsághoz kötött, ez a Social
// Media hozzáférés része, ezért a client_ai_profiles célszámai a sima
// clients-lekérdezésen keresztül jönnek (db/clients.ts CLIENT_SELECT).
export default function SocialMediaStatusView({ clients, items, onOpen }: SocialMediaStatusViewProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";

  const [clipProgress, setClipProgress] = useState<Record<number, ClippingProgress>>({});

  const clippingClients = useMemo(() => clients.filter((c) => c.service_clipping), [clients]);

  useEffect(() => {
    if (!token || clippingClients.length === 0) return;
    let cancelled = false;
    Promise.all(clippingClients.map((c) => getClippingProgress(token, c.id).then((p) => [c.id, p] as const))).then(
      (pairs) => {
        if (cancelled) return;
        setClipProgress(Object.fromEntries(pairs));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [token, clippingClients]);

  async function handleConfirmClipPayment(clientId: number) {
    if (!token) return;
    const progress = await confirmClippingPayment(token, clientId);
    setClipProgress((prev) => ({ ...prev, [clientId]: progress }));
  }

  const stats = useMemo(() => {
    let publishedThisMonth = 0;
    let inProgress = 0;
    for (const item of items) {
      if (item.status === "published") {
        if (isThisMonth(item.published_at)) publishedThisMonth++;
      } else {
        inProgress++;
      }
    }
    const clipPaymentPending = clippingClients.filter((c) => clipProgress[c.id]?.paymentConfirmed === false).length;
    return { activeClients: clients.length, publishedThisMonth, inProgress, clipPaymentPending };
  }, [items, clients.length, clippingClients, clipProgress]);

  if (clients.length === 0) {
    return <p className="chat-empty-hint">Nincs még felvett ügyfél.</p>;
  }

  return (
    <>
      <div className="mt-stats">
        <div className="mt-stat mt-stat--accent">
          <div className="mt-stat-value">{stats.activeClients}</div>
          <div className="mt-stat-label">Aktív ügyfél</div>
        </div>
        <div className="mt-stat mt-stat--success">
          <div className="mt-stat-value">{stats.publishedThisMonth}</div>
          <div className="mt-stat-label">Publikálva e hónapban</div>
        </div>
        <div className="mt-stat mt-stat--warning">
          <div className="mt-stat-value">{stats.inProgress}</div>
          <div className="mt-stat-label">Folyamatban</div>
        </div>
        <div className="mt-stat mt-stat--danger">
          <div className="mt-stat-value">{stats.clipPaymentPending}</div>
          <div className="mt-stat-label">Klip fizetésre vár</div>
        </div>
      </div>

      <div className="sm-status-grid">
        {clients.map((client) => {
          const clientItems = items.filter((i) => i.client_id === client.id);
          const postDone = clientItems.filter(
            (i) => i.content_type === "image_post" && i.status === "published" && isThisMonth(i.published_at)
          ).length;
          const videoDone = clientItems.filter(
            (i) => i.content_type === "video" && i.status === "published" && isThisMonth(i.published_at)
          ).length;
          const inProgress = clientItems.filter((i) => i.status !== "published");
          const clip = client.service_clipping ? clipProgress[client.id] : undefined;

          return (
            <div key={client.id} className="sm-status-card">
              <div className="sm-status-card-header">{client.company_name}</div>

              <div className="mt-progress-row">
                {client.service_clipping ? (
                  clip?.paymentConfirmed === false ? (
                    <div className="sm-status-locked">🔒 Klippek: fizetésre vár</div>
                  ) : (
                    <>
                      <div className="mt-progress-label">
                        <span>Klippek</span>
                        <span>
                          {clip?.done ?? "…"}/{clip?.target ?? client.monthly_video_target ?? "?"}
                        </span>
                      </div>
                      <div className="mt-progress">
                        <div
                          className={`mt-progress-fill${
                            clip?.done != null && clip.target != null && clip.done >= clip.target
                              ? " mt-progress-fill--done"
                              : ""
                          }`}
                          style={{ width: `${progressPct(clip?.done ?? 0, clip?.target ?? null)}%` }}
                        />
                      </div>
                    </>
                  )
                ) : (
                  client.monthly_video_target != null && (
                    <>
                      <div className="mt-progress-label">
                        <span>Videó</span>
                        <span>
                          {videoDone}/{client.monthly_video_target}
                        </span>
                      </div>
                      <div className="mt-progress">
                        <div
                          className={`mt-progress-fill${videoDone >= client.monthly_video_target ? " mt-progress-fill--done" : ""}`}
                          style={{ width: `${progressPct(videoDone, client.monthly_video_target)}%` }}
                        />
                      </div>
                    </>
                  )
                )}

                {client.monthly_post_target != null && (
                  <>
                    <div className="mt-progress-label">
                      <span>Poszt</span>
                      <span>
                        {postDone}/{client.monthly_post_target}
                      </span>
                    </div>
                    <div className="mt-progress">
                      <div
                        className={`mt-progress-fill${postDone >= client.monthly_post_target ? " mt-progress-fill--done" : ""}`}
                        style={{ width: `${progressPct(postDone, client.monthly_post_target)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              {client.service_clipping && isAdmin && clip?.paymentConfirmed === false && (
                <button type="button" className="sm-status-confirm-btn" onClick={() => void handleConfirmClipPayment(client.id)}>
                  Fizetés jóváhagyása
                </button>
              )}

              {!client.service_clipping &&
                (inProgress.length === 0 ? (
                  <p className="chat-empty-hint">Nincs folyamatban lévő tartalom.</p>
                ) : (
                  <ul className="sm-status-card-items">
                    {inProgress.map((item) => (
                      <li key={item.id}>
                        <button type="button" className="sm-status-card-item-btn" onClick={() => onOpen(item.id)}>
                          <span className="sm-status-card-item-title">{item.title}</span>
                          <span className="sm-status-card-item-meta">
                            {CONTENT_STATUS_LABELS[item.status]} · {PLATFORM_LABELS[item.platform]}
                            {item.last_actor_name && ` · utoljára: ${item.last_actor_name}`}
                            {!item.payment_confirmed && " · 🔒 fizetésre vár"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
