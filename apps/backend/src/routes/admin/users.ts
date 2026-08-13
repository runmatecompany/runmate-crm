import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { createUser, findUserByEmail, listUsers, setUserPassword } from "../../db/users.js";

const createUserBodySchema = {
  type: "object",
  required: ["name", "email", "password"],
  properties: {
    name: { type: "string", minLength: 1 },
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8 },
    role: { type: "string", enum: ["admin", "user"] },
  },
} as const;

const resetPasswordBodySchema = {
  type: "object",
  required: ["password"],
  properties: {
    password: { type: "string", minLength: 8 },
  },
} as const;

export default async function adminUsersRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get("/admin/users", async () => {
    return { users: await listUsers() };
  });

  fastify.post<{ Body: { name: string; email: string; password: string; role?: "admin" | "user" } }>(
    "/admin/users",
    { schema: { body: createUserBodySchema } },
    async (request, reply) => {
      const { name, email, password, role = "user" } = request.body;

      const existing = await findUserByEmail(email);
      if (existing) {
        return reply.code(409).send({ error: "A user with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await createUser({ name, email, passwordHash, role });
      return reply.code(201).send({ user });
    }
  );

  fastify.post<{ Params: { id: string }; Body: { password: string } }>(
    "/admin/users/:id/reset-password",
    { schema: { body: resetPasswordBodySchema } },
    async (request, reply) => {
      const id = Number(request.params.id);
      const passwordHash = await bcrypt.hash(request.body.password, 12);
      const updated = await setUserPassword(id, passwordHash);
      if (!updated) {
        return reply.code(404).send({ error: "User not found" });
      }
      return { ok: true };
    }
  );
}
