import type { FastifyInstance } from "fastify";
import {
  createManualTask,
  deleteManualTask,
  getManualTaskById,
  hasTasksAccess,
  listClientTaskSummaries,
  listManualTasks,
  updateManualTask,
  updateManualTaskStatus,
  type ManualTaskStatus,
} from "../db/tasks.js";
import { listContentItems } from "../db/contentItems.js";
import { getUserById } from "../db/users.js";

export async function canAccessTasksModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasTasksAccess(userId));
}

const MANUAL_TASK_STATUS_VALUES = ["todo", "in_progress", "done"] as const;

const createManualTaskBodySchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: "string" },
    clientId: { type: "integer" },
    assignedTo: { type: "integer" },
    dueDate: { type: "string" },
  },
} as const;

const updateManualTaskBodySchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: "string" },
    clientId: { type: "integer" },
    assignedTo: { type: "integer" },
    dueDate: { type: "string" },
  },
} as const;

const statusBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: [...MANUAL_TASK_STATUS_VALUES] },
  },
} as const;

// A Feladatok modul saját jogosultsággal fér a content_items/clients
// adatokhoz (nem a Social Media/Ügyfelek modul hozzáférésén keresztül) —
// így valaki kaphat Feladatok-hozzáférést anélkül, hogy a másik két
// modulhoz is hozzá kellene férnie.
export default async function tasksRoutes(fastify: FastifyInstance) {
  fastify.get("/tasks", { onRequest: [fastify.authenticate] }, async (request) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessTasksModule(userId, role))) {
      return { clients: [], items: [], manualTasks: [], hasAccess: false };
    }
    const [clients, items, manualTasks] = await Promise.all([
      listClientTaskSummaries(),
      listContentItems(),
      listManualTasks(),
    ]);
    return { clients, items, manualTasks, hasAccess: true };
  });

  fastify.post<{
    Body: { title: string; description?: string; clientId?: number; assignedTo?: number; dueDate?: string };
  }>("/tasks/manual", { onRequest: [fastify.authenticate], schema: { body: createManualTaskBodySchema } }, async (
    request,
    reply
  ) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessTasksModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Feladatok modulhoz" });
    }
    const task = await createManualTask({ ...request.body, createdBy: userId });
    return reply.code(201).send({ task });
  });

  fastify.patch<{
    Params: { id: string };
    Body: { title: string; description?: string; clientId?: number; assignedTo?: number; dueDate?: string };
  }>("/tasks/manual/:id", { onRequest: [fastify.authenticate], schema: { body: updateManualTaskBodySchema } }, async (
    request,
    reply
  ) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessTasksModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Feladatok modulhoz" });
    }
    const task = await updateManualTask(Number(request.params.id), request.body);
    if (!task) return reply.code(404).send({ error: "Feladat nem található" });
    return { task };
  });

  fastify.patch<{ Params: { id: string }; Body: { status: ManualTaskStatus } }>(
    "/tasks/manual/:id/status",
    { onRequest: [fastify.authenticate], schema: { body: statusBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessTasksModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Feladatok modulhoz" });
      }
      const actor = await getUserById(userId);
      const task = await updateManualTaskStatus(
        Number(request.params.id),
        request.body.status,
        actor ? { id: actor.id, name: actor.name } : undefined
      );
      if (!task) return reply.code(404).send({ error: "Feladat nem található" });
      return { task };
    }
  );

  fastify.delete<{ Params: { id: string } }>("/tasks/manual/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessTasksModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Feladatok modulhoz" });
    }
    const existing = await getManualTaskById(Number(request.params.id));
    if (!existing) return reply.code(404).send({ error: "Feladat nem található" });
    // Törölni csak a létrehozó vagy admin tudja, hogy más ne törölhesse
    // véletlenül egy kolléga rá kiosztott feladatát.
    if (role !== "admin" && existing.created_by !== userId) {
      return reply.code(403).send({ error: "Csak a létrehozó vagy admin törölheti a feladatot" });
    }
    await deleteManualTask(existing.id);
    return reply.send({ ok: true });
  });
}
