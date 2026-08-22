import { useMemo } from "react";
import type { Client } from "../../lib/clients";
import type { WebProject, WebProjectStatus } from "../../lib/webProjects";

interface WebStatusViewProps {
  clients: Client[];
  projects: WebProject[];
  onOpen: (project: WebProject) => void;
}

const STATUS_LABELS: Record<WebProjectStatus, string> = {
  planning: "Tervezés",
  development: "Fejlesztés",
  review: "Tesztelés / Jóváhagyás",
  live: "Élesítve",
};
const TYPE_LABELS = { website: "Weboldal", landing_page: "Landing" } as const;

// Ügyfelenkénti áttekintés — ugyanaz az elv, mint a Social Media
// "Állapot" fülén: nem kártyánként (mint a Kanban), hanem ügyfelenként
// csoportosítva mutatja, hol tart a weboldal/landing munkájuk.
export default function WebStatusView({ clients, projects, onOpen }: WebStatusViewProps) {
  const stats = useMemo(() => {
    const live = projects.filter((p) => p.status === "live").length;
    const inProgress = projects.filter((p) => p.status !== "live").length;
    return { activeClients: clients.length, live, inProgress };
  }, [clients.length, projects]);

  if (clients.length === 0) {
    return <p className="chat-empty-hint">Nincs olyan ügyfél, akinek weboldal vagy landing oldal szolgáltatása lenne.</p>;
  }

  return (
    <>
      <div className="mt-stats">
        <div className="mt-stat mt-stat--accent">
          <div className="mt-stat-value">{stats.activeClients}</div>
          <div className="mt-stat-label">Web-ügyfél</div>
        </div>
        <div className="mt-stat mt-stat--warning">
          <div className="mt-stat-value">{stats.inProgress}</div>
          <div className="mt-stat-label">Folyamatban</div>
        </div>
        <div className="mt-stat mt-stat--success">
          <div className="mt-stat-value">{stats.live}</div>
          <div className="mt-stat-label">Élesítve</div>
        </div>
      </div>

      <div className="sm-status-grid">
        {clients.map((client) => {
          const clientProjects = projects.filter((p) => p.client_id === client.id);
          return (
            <div key={client.id} className="sm-status-card">
              <div className="sm-status-card-header">{client.company_name}</div>
              {clientProjects.length === 0 ? (
                <p className="chat-empty-hint">Még nincs projekt létrehozva.</p>
              ) : (
                <ul className="sm-status-card-items">
                  {clientProjects.map((project) => (
                    <li key={project.id}>
                      <button type="button" className="sm-status-card-item-btn" onClick={() => onOpen(project)}>
                        <span className="sm-status-card-item-title">
                          {TYPE_LABELS[project.project_type]} — {project.title}
                        </span>
                        <span className="sm-status-card-item-meta">
                          {STATUS_LABELS[project.status]}
                          {project.assigned_to_name ? ` · ${project.assigned_to_name}` : " · nincs kiosztva"}
                          {project.last_actor_name &&
                            project.last_actor_name !== project.assigned_to_name &&
                            ` · utoljára: ${project.last_actor_name}`}
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
    </>
  );
}
