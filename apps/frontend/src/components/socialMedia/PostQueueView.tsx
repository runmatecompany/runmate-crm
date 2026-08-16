import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { PLATFORM_LABELS, getCardAction, transitionContentItem, type ContentItem } from "../../lib/socialMedia";

interface PostQueueViewProps {
  items: ContentItem[];
  onOpen: (itemId: number) => void;
  onChanged: () => void;
}

// A jóváhagyott vágású, posztolásra kész tartalmak (status: "scheduling") —
// ide kerülnek át a kanbanról, miután a vágás jóváhagyásra került, egészen
// addig, amíg tényleg ki nem lettek posztolva.
export default function PostQueueView({ items, onOpen, onChanged }: PostQueueViewProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const [busyId, setBusyId] = useState<number | null>(null);

  const queueItems = items
    .filter((i) => i.status === "scheduling")
    .sort((a, b) => a.client_name.localeCompare(b.client_name));

  async function handlePost(item: ContentItem) {
    if (!token) return;
    const cardAction = getCardAction(item.status);
    if (cardAction.kind !== "forward") return;
    const value = prompt("Tervezett közzétételi időpont (ÉÉÉÉ-HH-NNTÓÓ:PP):");
    if (!value) return;
    setBusyId(item.id);
    try {
      await transitionContentItem(token, item.id, cardAction.action, { scheduledPublishAt: value });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült végrehajtani a lépést");
    } finally {
      setBusyId(null);
    }
  }

  if (queueItems.length === 0) return <p className="chat-empty-hint">Nincs posztolásra váró tartalom.</p>;

  return (
    <table className="leads-table">
      <thead>
        <tr>
          <th>Ügyfél</th>
          <th>Tartalom</th>
          <th>Platform</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {queueItems.map((item) => {
          const cardAction = getCardAction(item.status);
          return (
            <tr key={item.id}>
              <td>{item.client_name}</td>
              <td>
                <button type="button" className="sm-queue-open" onClick={() => onOpen(item.id)}>
                  {item.title}
                </button>
              </td>
              <td>{PLATFORM_LABELS[item.platform]}</td>
              <td>
                {cardAction.kind === "forward" && (
                  <button type="button" disabled={busyId === item.id} onClick={() => handlePost(item)}>
                    {busyId === item.id ? "Mentés..." : cardAction.label}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
