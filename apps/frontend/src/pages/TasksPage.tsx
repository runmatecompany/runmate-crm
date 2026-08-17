import { useCallback, useEffect, useState } from "react";
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
import ManualTaskFormModal from "../components/tasks/ManualTaskFormModal";

const STATUS_ORDER: ManualTaskStatus[] = ["todo", "in_progress", "done"];
const STATUS_LABELS: Record<ManualTaskStatus, string> = {
  todo: "Teendő",
  in_progress: "Folyamatban",
  done: "Kész",
};

function isThisMonth(value: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function progressLabel(done: number, target: number | null): string {
  return target != null ? `${done}/${target} kész` : `${done} kész`;
}

function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("hu-HU", { year: "numeric", month: "short", day: "numeric" });
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
  const [openClientId, setOpenClientId] = useState<number | null>(null);
  const [formTask, setFormTask] = useState<ManualTask | "new" | null>(null);

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
          <h2 className="sm-section-title">Kézi feladatok</h2>
          <div className="sm-kanban">
            {STATUS_ORDER.map((status) => {
              const columnTasks = manualTasks.filter((t) => t.status === status);
              return (
                <div key={status} className="sm-kanban-col">
                  <div className="sm-kanban-col-header">
                    {STATUS_LABELS[status]} <span className="sm-kanban-col-count">{columnTasks.length}</span>
                  </div>
                  <div className="sm-kanban-col-body">
                    {columnTasks.map((task) => {
                      const dueLabel = formatDueDate(task.due_date);
                      const canDelete = isAdmin || task.created_by === auth?.user.id;
                      return (
                        <div key={task.id} className="sm-kanban-card">
                          <button type="button" className="sm-kanban-card-main" onClick={() => setFormTask(task)}>
                            {task.client_name && <div className="sm-kanban-card-client">{task.client_name}</div>}
                            <div className="sm-kanban-card-title">{task.title}</div>
                            <div className="sm-kanban-card-meta">
                              {task.assigned_to_name ? `Felelős: ${task.assigned_to_name}` : "Nincs kiosztva"}
                              {dueLabel && ` · Határidő: ${dueLabel}`}
                              {task.last_actor_name && ` · utoljára: ${task.last_actor_name}`}
                            </div>
                          </button>
                          <div className="sm-kanban-card-review-actions">
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
                              <button type="button" onClick={() => void handleDelete(task)}>
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

          {clients.map((client) => {
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
                            {item.last_actor_name && ` · utoljára: ${item.last_actor_name}`}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
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
