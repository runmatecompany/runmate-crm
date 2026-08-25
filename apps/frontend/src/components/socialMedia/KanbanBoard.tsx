import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../../lib/auth";
import type { Client } from "../../lib/clients";
import {
  confirmClippingPayment,
  getClippingProgress,
  sendClippingForPosting,
  type ClippingProgress,
} from "../../lib/clippingProgress";
import ClipUploadModal from "./ClipUploadModal";
import {
  CONTENT_STATUS_LABELS,
  IMAGE_POST_STATUSES,
  KANBAN_COLUMNS,
  PLATFORM_LABELS,
  STAGE_BADGE_LABELS,
  confirmContentItemPayment,
  getCardAction,
  getStageBadge,
  nextImagePostStatus,
  setContentItemStatus,
  transitionContentItem,
  uploadRawFiles,
  type ContentItem,
} from "../../lib/socialMedia";

interface KanbanBoardProps {
  items: ContentItem[];
  clients: Client[];
  onOpen: (id: number) => void;
  onChanged: () => void;
}

export default function KanbanBoard({ items, clients, onOpen, onChanged }: KanbanBoardProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadItemRef = useRef<ContentItem | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [clipProgress, setClipProgress] = useState<Record<number, ClippingProgress>>({});
  const [uploadTarget, setUploadTarget] = useState<Client | null>(null);

  // A Clippelés-ügyfeleknek nincs egyenkénti tartalom-kártyájuk (a kész
  // klipek számát a rendszer élőben a Drive-mappából olvassa, lásd
  // lib/clipping.ts) — de a vágónak pontosan itt, a "Vágásra vár"
  // oszlopban van rá szüksége, hogy lássa: kire vár még klippelés, és
  // honnan/hova kell dolgoznia. Egy állandó, ügyfelenkénti kártyaként
  // jelenik meg, függetlenül attól, hogy van-e már kész klip.
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

  async function handleSendClippingForPosting(clientId: number) {
    if (!token) return;
    try {
      await sendClippingForPosting(token, clientId);
      setClipProgress((prev) => {
        const existing = prev[clientId];
        return existing ? { ...prev, [clientId]: { ...existing, sentForPosting: true } } : prev;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült elküldeni posztolásra");
    }
  }

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

  async function handleConfirmPayment(item: ContentItem) {
    if (!token) return;
    try {
      await confirmContentItemPayment(token, item.id);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült jóváhagyni a fizetést");
    }
  }

  async function handleAdvanceImagePost(item: ContentItem) {
    const next = nextImagePostStatus(item.status);
    if (!next || !token) return;
    try {
      await setContentItemStatus(token, item.id, next);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült léptetni az állapotot");
    }
  }

  const videoItems = items.filter((i) => i.content_type === "video");
  const imagePostItems = items.filter((i) => i.content_type === "image_post");

  return (
    <div className="sm-kanban-wrap">
    <div className="sm-kanban">
      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesSelected} />
      {KANBAN_COLUMNS.map((column) => {
        const columnItems = videoItems.filter((i) => column.statuses.includes(i.status));
        // A "Forgatásra vár" oszlopban időrendben (a legközelebbi forgatás
        // elöl) érdemes látni, hogy melyik a legsürgősebb.
        if (column.key === "shoot") {
          columnItems.sort((a, b) => {
            if (!a.shoot_date) return 1;
            if (!b.shoot_date) return -1;
            return new Date(a.shoot_date).getTime() - new Date(b.shoot_date).getTime();
          });
        }
        const extraCount = column.key === "editing" ? clippingClients.length : 0;
        return (
          <div key={column.key} className="sm-kanban-col">
            <div className="sm-kanban-col-header">
              {column.label} <span className="sm-kanban-col-count">{columnItems.length + extraCount}</span>
            </div>
            <div className="sm-kanban-col-body">
              {column.key === "editing" &&
                clippingClients
                  .filter((client) => !clipProgress[client.id]?.sentForPosting)
                  .map((client) => {
                    const clip = clipProgress[client.id];
                    const quotaMet =
                      clip?.paymentConfirmed && clip.done != null && clip.target != null && clip.done >= clip.target;
                    return (
                      <div key={`clip-${client.id}`} className="sm-kanban-card sm-kanban-clip-card">
                        <div className="sm-kanban-card-client">{client.company_name}</div>
                        <div className="sm-kanban-card-title">Clippelés</div>
                        {clip?.paymentConfirmed === false ? (
                          <div className="sm-kanban-card-meta">
                            <span className="sm-kanban-card-badge sm-kanban-card-badge-payment">🔒 Fizetésre vár</span>
                          </div>
                        ) : (
                          <div className="sm-kanban-card-meta">
                            {clip?.done ?? "…"}/{clip?.target ?? "?"} kész
                          </div>
                        )}
                        {isAdmin && clip?.paymentConfirmed === false && (
                          <button
                            type="button"
                            className="sm-kanban-card-action"
                            onClick={() => void handleConfirmClipPayment(client.id)}
                          >
                            Fizetés jóváhagyása
                          </button>
                        )}
                        {clip?.paymentConfirmed && (
                          <div className="sm-kanban-card-actions">
                            <button type="button" className="sm-kanban-card-action" onClick={() => setUploadTarget(client)}>
                              Klip feltöltése
                            </button>
                            {quotaMet && (
                              <button
                                type="button"
                                className="sm-kanban-card-action sm-kanban-card-action-green"
                                onClick={() => void handleSendClippingForPosting(client.id)}
                              >
                                Küldés posztolásra
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              {columnItems.map((item) => {
                const cardAction = getCardAction(item.status);
                const isUploading = uploadingItemId === item.id;
                const stageBadge = getStageBadge(item);
                return (
                  <div key={item.id} className="sm-kanban-card">
                    <button type="button" className="sm-kanban-card-main" onClick={() => onOpen(item.id)}>
                      <div className="sm-kanban-card-client">{item.client_name}</div>
                      <div className="sm-kanban-card-title">{item.title}</div>
                      <div className="sm-kanban-card-meta">
                        {PLATFORM_LABELS[item.platform]}
                        {item.assigned_to_name ? ` · ${item.assigned_to_name}` : ""}
                        {item.last_actor_name ? ` · utoljára: ${item.last_actor_name}` : ""}
                      </div>
                      {stageBadge && (
                        <span className={`sm-kanban-card-badge sm-kanban-card-badge-${stageBadge}`}>
                          {STAGE_BADGE_LABELS[stageBadge]}
                        </span>
                      )}
                      {!item.payment_confirmed && (
                        <span className="sm-kanban-card-badge sm-kanban-card-badge-payment">🔒 Fizetésre vár</span>
                      )}
                    </button>
                    {!item.payment_confirmed ? (
                      isAdmin && (
                        <button type="button" className="sm-kanban-card-action" onClick={() => void handleConfirmPayment(item)}>
                          Fizetés jóváhagyása
                        </button>
                      )
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                );
              })}
              {columnItems.length === 0 && extraCount === 0 && <p className="sm-kanban-col-empty">—</p>}
            </div>
          </div>
        );
      })}
    </div>

    {imagePostItems.length > 0 && (
      <>
        <h2>Képes posztok</h2>
        <div className="sm-kanban">
          {IMAGE_POST_STATUSES.map((status) => {
            const columnItems = imagePostItems.filter((i) => i.status === status);
            return (
              <div key={status} className="sm-kanban-col">
                <div className="sm-kanban-col-header">
                  {CONTENT_STATUS_LABELS[status]} <span className="sm-kanban-col-count">{columnItems.length}</span>
                </div>
                <div className="sm-kanban-col-body">
                  {columnItems.map((item) => {
                    const next = nextImagePostStatus(item.status);
                    return (
                      <div key={item.id} className="sm-kanban-card">
                        <button type="button" className="sm-kanban-card-main" onClick={() => onOpen(item.id)}>
                          <div className="sm-kanban-card-client">{item.client_name}</div>
                          <div className="sm-kanban-card-title">{item.title}</div>
                          <div className="sm-kanban-card-meta">
                            {PLATFORM_LABELS[item.platform]}
                            {item.last_actor_name ? ` · utoljára: ${item.last_actor_name}` : ""}
                          </div>
                        </button>
                        {next && (
                          <button type="button" className="sm-kanban-card-action" onClick={() => void handleAdvanceImagePost(item)}>
                            Tovább: {CONTENT_STATUS_LABELS[next]}
                          </button>
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
      </>
    )}

    {uploadTarget && (
      <ClipUploadModal
        clientId={uploadTarget.id}
        clientName={uploadTarget.company_name}
        nextClipNumber={clipProgress[uploadTarget.id]?.nextClipNumber ?? null}
        onClose={() => setUploadTarget(null)}
        onUploaded={(progress) => {
          setClipProgress((prev) => ({ ...prev, [uploadTarget.id]: progress }));
          setUploadTarget(null);
        }}
        onProgressUpdate={(progress) => {
          setClipProgress((prev) => ({ ...prev, [uploadTarget.id]: progress }));
        }}
      />
    )}
    </div>
  );
}
