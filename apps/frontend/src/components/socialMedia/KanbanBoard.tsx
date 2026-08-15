import { useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../../lib/auth";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_ORDER,
  PLATFORM_LABELS,
  getCardAction,
  transitionContentItem,
  uploadRawFiles,
  type ContentItem,
} from "../../lib/socialMedia";

interface KanbanBoardProps {
  items: ContentItem[];
  onOpen: (id: number) => void;
  onChanged: () => void;
}

export default function KanbanBoard({ items, onOpen, onChanged }: KanbanBoardProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadItemRef = useRef<ContentItem | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function runAction(item: ContentItem, action: Parameters<typeof transitionContentItem>[2], value?: string) {
    if (!token) return;
    const cardAction = getCardAction(item.status);
    try {
      if (cardAction.kind === "forward" && cardAction.input) {
        await transitionContentItem(token, item.id, action, { scheduledPublishAt: value });
      } else if (action === "reject_script" || action === "reject_edit") {
        await transitionContentItem(token, item.id, action, { feedback: value });
      } else {
        await transitionContentItem(token, item.id, action);
      }
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült végrehajtani a lépést");
    }
  }

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    const item = pendingUploadItemRef.current;
    pendingUploadItemRef.current = null;
    if (!token || !item || files.length === 0) return;
    setUploadingItemId(item.id);
    setUploadProgress(0);
    try {
      await uploadRawFiles(token, item.id, files, setUploadProgress);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat");
    } finally {
      setUploadingItemId(null);
    }
  }

  function handleCardAction(item: ContentItem) {
    const cardAction = getCardAction(item.status);
    if (cardAction.kind === "none") return;
    if (cardAction.kind === "review") return; // a Jóváhagyva/Módosítás kell gombok külön kezelve
    if (cardAction.action === "upload_raw") {
      pendingUploadItemRef.current = item;
      fileInputRef.current?.click();
    } else if (cardAction.input === "scheduledPublishAt") {
      const value = prompt("Tervezett közzétételi időpont (ÉÉÉÉ-HH-NNTÓÓ:PP):");
      if (!value) return;
      void runAction(item, cardAction.action, value);
    } else {
      void runAction(item, cardAction.action);
    }
  }

  function handleReject(item: ContentItem, action: "reject_script" | "reject_edit") {
    const feedback = prompt("Mit kell módosítani?");
    if (!feedback?.trim()) return;
    void runAction(item, action, feedback);
  }

  return (
    <div className="sm-kanban">
      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesSelected} />
      {CONTENT_STATUS_ORDER.map((status) => {
        const columnItems = items.filter((i) => i.status === status);
        // A "Forgatásra vár" oszlopban időrendben (a legközelebbi forgatás
        // elöl) érdemes látni, hogy melyik a legsürgősebb.
        if (status === "shoot_done") {
          columnItems.sort((a, b) => {
            if (!a.shoot_date) return 1;
            if (!b.shoot_date) return -1;
            return new Date(a.shoot_date).getTime() - new Date(b.shoot_date).getTime();
          });
        }
        return (
          <div key={status} className="sm-kanban-col">
            <div className="sm-kanban-col-header">
              {CONTENT_STATUS_LABELS[status]} <span className="sm-kanban-col-count">{columnItems.length}</span>
            </div>
            <div className="sm-kanban-col-body">
              {columnItems.map((item) => {
                const cardAction = getCardAction(item.status);
                const isUploading = uploadingItemId === item.id;
                return (
                  <div key={item.id} className="sm-kanban-card">
                    <button type="button" className="sm-kanban-card-main" onClick={() => onOpen(item.id)}>
                      <div className="sm-kanban-card-client">{item.client_name}</div>
                      <div className="sm-kanban-card-title">{item.title}</div>
                      <div className="sm-kanban-card-meta">
                        {PLATFORM_LABELS[item.platform]}
                        {item.assigned_to_name ? ` · ${item.assigned_to_name}` : ""}
                      </div>
                    </button>
                    {cardAction.kind === "forward" && (
                      <button
                        type="button"
                        className="sm-kanban-card-action"
                        disabled={isUploading}
                        onClick={() => handleCardAction(item)}
                      >
                        {isUploading ? `Feltöltés... ${Math.round(uploadProgress * 100)}%` : cardAction.label}
                      </button>
                    )}
                    {cardAction.kind === "review" && (
                      <div className="sm-kanban-card-review-actions">
                        <button type="button" onClick={() => void runAction(item, cardAction.approveAction)}>
                          Jóváhagyva
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleReject(item, cardAction.rejectAction as "reject_script" | "reject_edit")
                          }
                        >
                          Módosítás kell
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {columnItems.length === 0 && <p className="sm-kanban-col-empty">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
