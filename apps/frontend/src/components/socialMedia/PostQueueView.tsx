import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useNavigation } from "../../lib/navigation";
import { PLATFORM_LABELS, getCardAction, transitionContentItem, type ContentItem } from "../../lib/socialMedia";
import {
  listClippingPostQueue,
  markClippingPosted,
  type ClippingPostQueueEntry,
} from "../../lib/clippingProgress";

interface PostQueueViewProps {
  items: ContentItem[];
  onOpen: (itemId: number) => void;
  onChanged: () => void;
}

// A vágott videó Drive-mappájának linkje ("edited_media_url") egy teljes
// https://drive.google.com/drive/folders/{id} URL — innen kell kinyerni a
// puszta azonosítót, mert a beépített Drive-böngésző (DriveView) mappa-ID-t
// vár, nem URL-t.
function extractDriveFolderId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// A jóváhagyott vágású, posztolásra kész tartalmak (status: "scheduling") —
// ide kerülnek át a kanbanról, miután a vágás jóváhagyásra került, egészen
// addig, amíg tényleg ki nem lettek posztolva. A Clippelés-ügyfelek havi
// klip-adagjai a "Küldés posztolásra" gombbal kerülnek ide (lásd
// clipping_post_queue) — ezeknek nincs egyedi tartalom-kártyájuk, csak egy
// ügyfél+hónap+darabszám bejegyzés.
export default function PostQueueView({ items, onOpen, onChanged }: PostQueueViewProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const { openDriveFolder } = useNavigation();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clipQueue, setClipQueue] = useState<ClippingPostQueueEntry[]>([]);
  const [busyClipId, setBusyClipId] = useState<number | null>(null);

  const queueItems = items
    .filter((i) => i.status === "scheduling")
    .sort((a, b) => a.client_name.localeCompare(b.client_name));

  useEffect(() => {
    if (!token) return;
    listClippingPostQueue(token).then(setClipQueue);
  }, [token]);

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

  async function handleClipPosted(entry: ClippingPostQueueEntry) {
    if (!token) return;
    setBusyClipId(entry.id);
    try {
      await markClippingPosted(token, entry.id);
      setClipQueue((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült jelezni, hogy posztolva lett");
    } finally {
      setBusyClipId(null);
    }
  }

  if (queueItems.length === 0 && clipQueue.length === 0) {
    return <p className="chat-empty-hint">Nincs posztolásra váró tartalom.</p>;
  }

  return (
    <table className="leads-table">
      <thead>
        <tr>
          <th>Ügyfél</th>
          <th>Tartalom</th>
          <th>Platform</th>
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {clipQueue.map((entry) => (
          <tr key={`clip-${entry.id}`}>
            <td>{entry.client_name}</td>
            <td>{entry.clip_count} klip ({entry.year_month})</td>
            <td>—</td>
            <td>
              <button type="button" onClick={() => openDriveFolder(entry.folder_id)}>
                Megnyitás a Drive-ban
              </button>
            </td>
            <td>
              <button type="button" disabled={busyClipId === entry.id} onClick={() => handleClipPosted(entry)}>
                {busyClipId === entry.id ? "Mentés..." : "Posztolva"}
              </button>
            </td>
          </tr>
        ))}
        {queueItems.map((item) => {
          const cardAction = getCardAction(item.status);
          const folderId = extractDriveFolderId(item.edited_media_url);
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
                {folderId && (
                  <button type="button" onClick={() => openDriveFolder(folderId)}>
                    Megnyitás a Drive-ban
                  </button>
                )}
              </td>
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
