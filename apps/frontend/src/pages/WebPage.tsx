import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { listClients, type Client } from "../lib/clients";
import {
  deleteWebProject,
  listWebProjects,
  updateWebProject,
  updateWebProjectStatus,
  type WebProject,
  type WebProjectInput,
  type WebProjectStatus,
} from "../lib/webProjects";
import WebProjectFormModal from "../components/web/WebProjectFormModal";
import WebStatusView from "../components/web/WebStatusView";

export type WebTab = "status" | "projects";

const STATUS_ORDER: WebProjectStatus[] = ["planning", "development", "review", "live"];
const STATUS_LABELS: Record<WebProjectStatus, string> = {
  planning: "Tervezés",
  development: "Fejlesztés",
  review: "Tesztelés / Jóváhagyás",
  live: "Élesítve",
};
const TYPE_LABELS = { website: "Weboldal", landing_page: "Landing" } as const;
const TAB_LABELS: Record<WebTab, string> = { status: "Állapot", projects: "Projektek" };

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

interface WebPageProps {
  tab: WebTab;
}

// A weboldal és landing oldal projektek egy közös Kanban-táblában élnek
// (a project_type csak egy jelölő, nem külön modul) — a felhasználó
// kifejezetten így kérte: "itt vegyesen lesznek egyben a weboldalas és a
// landing oldalas projektek". Kézi "+ Új projekt" nincs — a projektek az
// onboardingból (Weboldal/Landing szolgáltatás bejelölése) jönnek létre
// automatikusan, lásd db/clientOnboarding.ts ensureWebProjectForService.
export default function WebPage({ tab }: WebPageProps) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const isAdmin = auth?.user.role === "admin";

  const [projects, setProjects] = useState<WebProject[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [formProject, setFormProject] = useState<WebProject | null>(null);

  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [clientFilter, setClientFilter] = useState<number | "">("");
  const [typeFilter, setTypeFilter] = useState<"" | "website" | "landing_page">("");

  const refresh = useCallback(() => {
    if (!token) return;
    listWebProjects(token)
      .then((result) => {
        setProjects(result.projects);
        setHasAccess(result.hasAccess);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    listClients(token).then((result) => setClients(result.clients));
  }, [token]);

  const webClients = useMemo(
    () => clients.filter((c) => c.service_website_build || c.service_landing_page),
    [clients]
  );

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (onlyMine && p.assigned_to !== auth?.user.id) return false;
      if (clientFilter !== "" && p.client_id !== clientFilter) return false;
      if (typeFilter !== "" && p.project_type !== typeFilter) return false;
      if (term && !p.title.toLowerCase().includes(term) && !p.client_name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [projects, onlyMine, clientFilter, typeFilter, search, auth?.user.id]);

  async function handleSaveProject(input: WebProjectInput) {
    if (!token || !formProject) return;
    await updateWebProject(token, formProject.id, input);
    setFormProject(null);
    refresh();
  }

  async function handleStatusMove(project: WebProject, direction: 1 | -1) {
    if (!token) return;
    const currentIndex = STATUS_ORDER.indexOf(project.status);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= STATUS_ORDER.length) return;
    await updateWebProjectStatus(token, project.id, STATUS_ORDER[nextIndex]);
    refresh();
  }

  async function handleDelete(project: WebProject) {
    if (!token) return;
    if (!confirm(`Biztosan törlöd a(z) "${project.title}" projektet?`)) return;
    try {
      await deleteWebProject(token, project.id);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nem sikerült törölni a projektet");
    }
  }

  if (!loading && !hasAccess) {
    return (
      <main className="leads-page">
        <h1>Web</h1>
        <p className="chat-empty-hint">Nincs hozzáférésed a Web modulhoz. Kérj hozzáférést egy adminisztrátortól.</p>
      </main>
    );
  }

  return (
    <main className="leads-page sm-page">
      <div className="leads-header">
        <h1>Web — {TAB_LABELS[tab]}</h1>
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}

      {!loading && tab === "status" && (
        <WebStatusView clients={webClients} projects={projects} onOpen={setFormProject} />
      )}

      {!loading && tab === "projects" && (
        <>
          <div className="mt-toolbar">
            <input
              type="text"
              className="mt-search"
              placeholder="Keresés a projektek között..."
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <select value={clientFilter} onChange={(e) => setClientFilter(e.currentTarget.value ? Number(e.currentTarget.value) : "")}>
              <option value="">Összes ügyfél</option>
              {webClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.currentTarget.value as "" | "website" | "landing_page")}>
              <option value="">Összes típus</option>
              <option value="website">Weboldal</option>
              <option value="landing_page">Landing</option>
            </select>
            <label className="mt-only-mine">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.currentTarget.checked)} />
              Csak az enyém
            </label>
          </div>

          <div className="sm-kanban">
            {STATUS_ORDER.map((status) => {
              const columnProjects = filteredProjects.filter((p) => p.status === status);
              return (
                <div key={status} className="sm-kanban-col">
                  <div className="sm-kanban-col-header">
                    <span>{STATUS_LABELS[status]}</span>
                    <span className="sm-kanban-col-count">{columnProjects.length}</span>
                  </div>
                  <div className="sm-kanban-col-body">
                    {columnProjects.map((project) => {
                      const canDelete = isAdmin || project.created_by === auth?.user.id;
                      return (
                        <div key={project.id} className="sm-kanban-card mt-card">
                          <button type="button" className="mt-card-body" onClick={() => setFormProject(project)}>
                            <div className="mt-card-tags">
                              <span className="mt-client-pill">{project.client_name}</span>
                              <span className="mt-due-badge">{TYPE_LABELS[project.project_type]}</span>
                            </div>
                            <div className="mt-card-title">{project.title}</div>
                            {project.live_url && <div className="mt-card-desc">{project.live_url}</div>}
                            <div className="mt-card-footer">
                              {project.assigned_to_name ? (
                                <span className="mt-avatar" style={{ backgroundColor: avatarColor(project.assigned_to_name) }}>
                                  {initials(project.assigned_to_name)}
                                </span>
                              ) : (
                                <span className="mt-avatar mt-avatar--empty">?</span>
                              )}
                              <span>{project.assigned_to_name ?? "Nincs kiosztva"}</span>
                            </div>
                            {project.last_actor_name && project.last_actor_name !== project.assigned_to_name && (
                              <div className="mt-card-meta">utoljára: {project.last_actor_name}</div>
                            )}
                          </button>
                          <div className="mt-card-actions">
                            {status !== STATUS_ORDER[0] && (
                              <button type="button" onClick={() => void handleStatusMove(project, -1)}>
                                ◀ Vissza
                              </button>
                            )}
                            {status !== STATUS_ORDER[STATUS_ORDER.length - 1] && (
                              <button type="button" onClick={() => void handleStatusMove(project, 1)}>
                                Tovább ▶
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" className="mt-action-danger" onClick={() => void handleDelete(project)}>
                                Törlés
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {columnProjects.length === 0 && <p className="sm-kanban-col-empty">—</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {formProject && (
        <WebProjectFormModal project={formProject} onClose={() => setFormProject(null)} onSave={handleSaveProject} />
      )}
    </main>
  );
}
