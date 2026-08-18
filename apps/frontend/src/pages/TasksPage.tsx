import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  deleteManualTask,
  listTasks,
  updateManualTaskStatus,
  createManualTask,
  updateManualTask,
  type ClientTaskSummary,
  type ManualTask,
  type ManualTaskInput,
  type ManualTaskStatus,
} from "../lib/tasks";
import { CONTENT_STATUS_LABELS, PLATFORM_LABELS, type ContentItem } from "../lib/socialMedia";
import { confirmClippingPayment, getClippingProgress, type ClippingProgress } from "../lib/clippingProgress";
import ManualTaskFormModal from "../components/tasks/ManualTaskFormModal";

const STATUS_ORDER: ManualTaskStatus[] = ["todo", "in_progress", "done"];
const STATUS_LABELS: Record<ManualTaskStatus, string> = {
  todo: "Teendő",
  in_progress: "Folyamatban",
  done: "Kész",
};

const AVATAR_PALETTE = ["#2f7fe0", "#17a2b8", "#8e6ff7", "#e05f9b", "#f5a623", "#3ecf8e"];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0] ?? "?"];
  return chars.join("").toUpperCase();
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isOverdue(task: ManualTask): boolean {
  if (!task.due_date || task.status === "done") return false;
  return new Date(task.due_date) < startOfToday();
}

function isDueSoon(task: ManualTask): boolean {
  if (!task.due_date || task.status === "done") return false;
  const due = new Date(task.due_date);
  const in2Days = new Date(startOfToday());
  in2Days.setDate(in2Days.getDate() + 2);
  return due >= startOfToday() && due <= in2Days;
}

function isDueToday(task: ManualTask): boolean {
  if (!task.due_date) return false;
  const due = new Date(task.due_date);
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return due >= today && due < tomorrow;
}

function isThisWeek(value: string): boolean {
  const d = new Date(value);
  const now = new Date();
  const startOfWeek = new Date(now);
  const dayOffset = (now.getDay() + 6) % 7; // hétfő = hét eleje
  startOfWeek.setDate(now.getDate() - dayOffset);
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function isThisMonth(value: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
}

export default function TasksPage() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";

  const [clients, setClients] = useState<ClientTaskSummary[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [formTask, setFormTask] = useState<ManualTask | "new" | null>(null);

  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [clientFilter, setClientFilter] = useState<number | "">("");
  const [clipProgress, setClipProgress] = useState<Record<number, ClippingProgress>>({});

  const refresh = useCallback(() => {
    if (!token) return;
    listTasks(token)
      .then((result) => {
        setClients(result.clients);
        setItems(result.items);
        setManualTasks(result.manualTasks);
        setHasAccess(result.hasAccess);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clippingClients = useMemo(() => clients.filter((c) => c.service_clipping), [clients]);

  useEffect(() => {
    if (!token || clippingClients.length === 0) return;
    let cancelled = false;
    Promise.all(
      clippingClients.map((c) => getClippingProgress(token, c.client_id).then((p) => [c.client_id, p] as const))
    ).then((pairs) => {
      if (cancelled) return;
      setClipProgress(Object.fromEntries(pairs));
    });
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
    const open = manualTasks.filter((t) => t.status !== "done").length;
    const overdue = manualTasks.filter(isOverdue).length;
    const dueToday = manualTasks.filter(isDueToday).length;
    const doneThisWeek = manualTasks.filter((t) => t.status === "done" && isThisWeek(t.updated_at)).length;
    return { open, overdue, dueToday, doneThisWeek };
  }, [manualTasks]);

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return manualTasks.filter((t) => {
      if (onlyMine && t.assigned_to !== auth?.user.id) return false;
      if (clientFilter !== "" && t.client_id !== clientFilter) return false;
      if (term && !t.title.toLowerCase().includes(term) && !(t.description ?? "").toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [manualTasks, onlyMine, clientFilter, search, auth?.user.id]);

  async function handleSaveTask(input: ManualTaskInput) {
    if (!token) return;
    if (formTask && formTask !== "new") {
      await updateManualTask(token, formTask.id, input);
    } else {
      await createManualTask(token, input);
    }
    setFormTask(null);
    refresh();
  }

  async function handleStatusMove(task: ManualTask, direction: 1 | -1) {
    if (!token) return;
    const currentIndex = STATUS_ORDER.indexOf(task.status);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= STATUS_ORDER.length) return;
    try {
      await updateManualTaskStatus(token, task.id, STATUS_ORDER[nextIndex]);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült frissíteni az állapotot");
    }
  }

  async function handleDelete(task: ManualTask) {
    if (!token) return;
    if (!confirm(`Biztosan törlöd ezt a feladatot: "${task.title}"?`)) return;
    try {
      await deleteManualTask(token, task.id);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült törölni a feladatot");
    }
  }

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
        <button type="button" onClick={() => setFormTask("new")}>
          + Új feladat
        </button>
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && (
        <>
          <div className="mt-stats">
            <div className="mt-stat mt-stat--accent">
              <div className="mt-stat-value">{stats.open}</div>
              <div className="mt-stat-label">Nyitott feladat</div>
            </div>
            <div className="mt-stat mt-stat--danger">
              <div className="mt-stat-value">{stats.overdue}</div>
              <div className="mt-stat-label">Lejárt határidejű</div>
            </div>
            <div className="mt-stat mt-stat--warning">
              <div className="mt-stat-value">{stats.dueToday}</div>
              <div className="mt-stat-label">Ma esedékes</div>
            </div>
            <div className="mt-stat mt-stat--success">
              <div className="mt-stat-value">{stats.doneThisWeek}</div>
              <div className="mt-stat-label">Kész ezen a héten</div>
            </div>
          </div>

          <div className="mt-toolbar">
            <input
              type="text"
              className="mt-search"
              placeholder="Keresés a feladatok között..."
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <select value={clientFilter} onChange={(e) => setClientFilter(e.currentTarget.value ? Number(e.currentTarget.value) : "")}>
              <option value="">Összes ügyfél</option>
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id}>
                  {c.client_name}
                </option>
              ))}
            </select>
            <label className="mt-only-mine">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.currentTarget.checked)} />
              Csak az enyém
            </label>
          </div>

          <div className="sm-kanban">
            {STATUS_ORDER.map((status) => {
              const columnTasks = filteredTasks.filter((t) => t.status === status);
              return (
                <div key={status} className="sm-kanban-col">
                  <div className="sm-kanban-col-header">
                    <span>
                      <span className={`mt-col-dot mt-col-dot--${status}`} />
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="sm-kanban-col-count">{columnTasks.length}</span>
                  </div>
                  <div className="sm-kanban-col-body">
                    {columnTasks.map((task) => {
                      const dueLabel = formatDueDate(task.due_date);
                      const overdue = isOverdue(task);
                      const soon = !overdue && isDueSoon(task);
                      const canDelete = isAdmin || task.created_by === auth?.user.id;

                      return (
                        <div key={task.id} className={`sm-kanban-card mt-card${overdue ? " mt-card--overdue" : ""}`}>
                          <button type="button" className="mt-card-body" onClick={() => setFormTask(task)}>
                            <div className="mt-card-tags">
                              {task.client_name && <span className="mt-client-pill">{task.client_name}</span>}
                              {dueLabel && (
                                <span
                                  className={`mt-due-badge${overdue ? " mt-due-badge--overdue" : soon ? " mt-due-badge--soon" : ""}`}
                                >
                                  {overdue ? `⚠ ${dueLabel}` : dueLabel}
                                </span>
                              )}
                            </div>
                            <div className="mt-card-title">{task.title}</div>
                            {task.description && <div className="mt-card-desc">{task.description}</div>}
                            <div className="mt-card-footer">
                              {task.assigned_to_name ? (
                                <span className="mt-avatar" style={{ backgroundColor: avatarColor(task.assigned_to_name) }}>
                                  {initials(task.assigned_to_name)}
                                </span>
                              ) : (
                                <span className="mt-avatar mt-avatar--empty">?</span>
                              )}
                              <span>
                                {task.assigned_to_name ?? "Nincs kiosztva"}
                                {task.last_actor_name && task.last_actor_name !== task.assigned_to_name
                                  ? ` · utoljára: ${task.last_actor_name}`
                                  : ""}
                              </span>
                            </div>
                          </button>
                          <div className="mt-card-actions">
                            {status !== "todo" && (
                              <button type="button" onClick={() => void handleStatusMove(task, -1)}>
                                ◀ Vissza
                              </button>
                            )}
                            {status !== "done" && (
                              <button type="button" onClick={() => void handleStatusMove(task, 1)}>
                                Tovább ▶
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" className="mt-action-danger" onClick={() => void handleDelete(task)}>
                                Törlés
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {columnTasks.length === 0 && <p className="sm-kanban-col-empty">—</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <h2 className="sm-section-title">Ügyfelenkénti tartalom-áttekintés</h2>
          {clients.length === 0 && <p className="chat-empty-hint">Nincs még felvett ügyfél.</p>}

          <div className="mt-client-grid">
            {clients.map((client) => {
              const clientItems = items.filter((i) => i.client_id === client.client_id);
              const videoDone = clientItems.filter(
                (i) => i.content_type === "video" && i.status === "published" && isThisMonth(i.published_at)
              ).length;
              const postDone = clientItems.filter(
                (i) => i.content_type === "image_post" && i.status === "published" && isThisMonth(i.published_at)
              ).length;
              const inProgress = clientItems.filter((i) => i.status !== "published");
              const videoTarget = client.monthly_video_target;
              const postTarget = client.monthly_post_target;
              const clip = client.service_clipping ? clipProgress[client.client_id] : undefined;

              return (
                <div key={client.client_id} className="mt-client-card">
                  <div className="mt-client-card-header">{client.client_name}</div>

                  {client.service_clipping ? (
                    clip?.paymentConfirmed === false ? (
                      <div className="sm-status-locked">🔒 Klippek: fizetésre vár</div>
                    ) : (
                      <div className="mt-progress-row">
                        <div className="mt-progress-label">
                          <span>Klippek</span>
                          <span>
                            {clip?.done ?? "…"}/{clip?.target ?? videoTarget ?? "?"}
                          </span>
                        </div>
                        <div className="mt-progress">
                          <div
                            className={`mt-progress-fill${
                              clip?.done != null && clip.target != null && clip.done >= clip.target
                                ? " mt-progress-fill--done"
                                : ""
                            }`}
                            style={{
                              width: `${Math.min(100, ((clip?.done ?? 0) / Math.max(1, clip?.target ?? 1)) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  ) : (
                    videoTarget != null && (
                      <div className="mt-progress-row">
                        <div className="mt-progress-label">
                          <span>Videó</span>
                          <span>{videoDone}/{videoTarget}</span>
                        </div>
                        <div className="mt-progress">
                          <div
                            className={`mt-progress-fill${videoDone >= videoTarget ? " mt-progress-fill--done" : ""}`}
                            style={{ width: `${Math.min(100, (videoDone / Math.max(1, videoTarget)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  )}

                  {client.service_clipping && isAdmin && clip?.paymentConfirmed === false && (
                    <button
                      type="button"
                      className="sm-status-confirm-btn"
                      onClick={() => void handleConfirmClipPayment(client.client_id)}
                    >
                      Fizetés jóváhagyása
                    </button>
                  )}

                  {postTarget != null && (
                    <div className="mt-progress-row">
                      <div className="mt-progress-label">
                        <span>Képes poszt</span>
                        <span>{postDone}/{postTarget}</span>
                      </div>
                      <div className="mt-progress">
                        <div
                          className={`mt-progress-fill${postDone >= postTarget ? " mt-progress-fill--done" : ""}`}
                          style={{ width: `${Math.min(100, (postDone / Math.max(1, postTarget)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {!client.service_clipping &&
                    (inProgress.length === 0 ? (
                      <p className="chat-empty-hint">Nincs folyamatban lévő tartalom.</p>
                    ) : (
                      <ul className="mt-client-card-items">
                        {inProgress.map((item) => (
                          <li key={item.id} className="mt-client-card-item">
                            <span className="mt-client-card-item-title">{item.title}</span>
                            <span className="mt-client-card-item-meta">
                              {CONTENT_STATUS_LABELS[item.status]} · {PLATFORM_LABELS[item.platform]}
                              {item.last_actor_name && ` · utoljára: ${item.last_actor_name}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {formTask && (
        <ManualTaskFormModal
          task={formTask === "new" ? undefined : formTask}
          onClose={() => setFormTask(null)}
          onSave={handleSaveTask}
        />
      )}
    </main>
  );
}
