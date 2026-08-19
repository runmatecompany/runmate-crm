import type { FastifyInstance } from "fastify";
import {
  createWebProject,
  deleteWebProject,
  getWebProjectById,
  hasWebAccess,
  listWebProjects,
  updateWebProject,
  updateWebProjectStatus,
  type WebProjectStatus,
  type WebProjectType,
} from "../db/webProjects.js";
import { getUserById } from "../db/users.js";

export async function canAccessWebModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasWebAccess(userId));
}

const PROJECT_TYPE_VALUES = ["website", "landing_page"] as const;
const PROJECT_STATUS_VALUES = ["planning", "development", "review", "live"] as const;

const projectBodySchema = {
  type: "object",
  required: ["title", "projectType", "clientId"],
  properties: {
    title: { type: "string", minLength: 1 },
    projectType: { type: "string", enum: [...PROJECT_TYPE_VALUES] },
    clientId: { type: "integer" },
    liveUrl: { type: "string" },
    notes: { type: "string" },
    assignedTo: { type: "integer" },
  },
} as const;

const statusBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: [...PROJECT_STATUS_VALUES] },
  },
} as const;

interface ProjectBody {
  title: string;
  projectType: WebProjectType;
  clientId: number;
  liveUrl?: string;
  notes?: string;
  assignedTo?: number;
}

// Saját modul-szintű jogosultság (web_access), nem a Social Media/Ügyfelek
// modul hozzáférésén keresztül — ugyanaz az elv, mint a Feladatok modulnál.
export default async function webRoutes(fastify: FastifyInstance) {
  fastify.get("/web/projects", { onRequest: [fastify.authenticate] }, async (request) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessWebModule(userId, role))) {
      return { projects: [], hasAccess: false };
    }
    return { projects: await listWebProjects(), hasAccess: true };
  });

  fastify.post<{ Body: ProjectBody }>(
    "/web/projects",
    { onRequest: [fastify.authenticate], schema: { body: projectBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessWebModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
      }
      const project = await createWebProject({ ...request.body, createdBy: userId });
      return reply.code(201).send({ project });
    }
  );

  fastify.patch<{ Params: { id: string }; Body: ProjectBody }>(
    "/web/projects/:id",
    { onRequest: [fastify.authenticate], schema: { body: projectBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessWebModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
      }
      const project = await updateWebProject(Number(request.params.id), request.body);
      if (!project) return reply.code(404).send({ error: "Projekt nem található" });
      return { project };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { status: WebProjectStatus } }>(
    "/web/projects/:id/status",
    { onRequest: [fastify.authenticate], schema: { body: statusBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessWebModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
      }
      const actor = await getUserById(userId);
      const project = await updateWebProjectStatus(
        Number(request.params.id),
        request.body.status,
        actor ? { id: actor.id, name: actor.name } : undefined
      );
      if (!project) return reply.code(404).send({ error: "Projekt nem található" });
      return { project };
    }
  );

  fastify.delete<{ Params: { id: string } }>("/web/projects/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessWebModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
    }
    const existing = await getWebProjectById(Number(request.params.id));
    if (!existing) return reply.code(404).send({ error: "Projekt nem található" });
    if (role !== "admin" && existing.created_by !== userId) {
      return reply.code(403).send({ error: "Csak a létrehozó vagy admin törölheti a projektet" });
    }
    await deleteWebProject(existing.id);
    return reply.send({ ok: true });
  });
}
