import type { Client } from "../../lib/clients";
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

function progressLabel(done: number, target: number | null): string {
  return target != null ? `${done}/${target} kész` : `${done} kész`;
}

// Mindig nyitott, kattintás nélküli mini-profil ügyfelenként — ellentétben
// a Feladatok modullal, ami külön modul-jogosultsághoz kötött, ez a Social
// Media hozzáférés része, ezért a client_ai_profiles célszámai a sima
// clients-lekérdezésen keresztül jönnek (db/clients.ts CLIENT_SELECT).
export default function SocialMediaStatusView({ clients, items, onOpen }: SocialMediaStatusViewProps) {
  if (clients.length === 0) {
    return <p className="chat-empty-hint">Nincs még felvett ügyfél.</p>;
  }

  return (
    <div className="sm-status-grid">
      {clients.map((client) => {
        const clientItems = items.filter((i) => i.client_id === client.id);
        const videoDone = clientItems.filter(
          (i) => i.content_type === "video" && i.status === "published" && isThisMonth(i.published_at)
        ).length;
        const postDone = clientItems.filter(
          (i) => i.content_type === "image_post" && i.status === "published" && isThisMonth(i.published_at)
        ).length;
        const inProgress = clientItems.filter((i) => i.status !== "published");

        return (
          <div key={client.id} className="sm-status-card">
            <div className="sm-status-card-header">{client.company_name}</div>
            <div className="sm-status-card-targets">
              <span>Videó: {progressLabel(videoDone, client.monthly_video_target)}</span>
              <span>Poszt: {progressLabel(postDone, client.monthly_post_target)}</span>
            </div>
            {inProgress.length === 0 ? (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
