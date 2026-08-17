import type { FastifyInstance } from "fastify";
import { hasTasksAccess, listClientTaskSummaries } from "../db/tasks.js";
import { listContentItems } from "../db/contentItems.js";

export async function canAccessTasksModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasTasksAccess(userId));
}

// A Feladatok modul saját jogosultsággal fér a content_items/clients
// adatokhoz (nem a Social Media/Ügyfelek modul hozzáférésén keresztül) —
// így valaki kaphat Feladatok-hozzáférést anélkül, hogy a másik két
// modulhoz is hozzá kellene férnie.
export default async function tasksRoutes(fastify: FastifyInstance) {
  fastify.get("/tasks", { onRequest: [fastify.authenticate] }, async (request) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessTasksModule(userId, role))) {
      return { clients: [], items: [], hasAccess: false };
    }
    const [clients, items] = await Promise.all([listClientTaskSummaries(), listContentItems()]);
    return { clients, items, hasAccess: true };
  });
}
