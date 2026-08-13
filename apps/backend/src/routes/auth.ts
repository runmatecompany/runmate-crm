import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { findUserByEmail } from "../db/users.js";

const loginBodySchema = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 1 },
    remember: { type: "boolean" },
  },
} as const;

// "Emlékezz rám" esetén hosszabb ideig marad érvényben a bejelentkezés,
// hogy ne kelljen gyakran újra megadni az adatokat.
const REMEMBER_ME_EXPIRES_IN = "30d";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { email: string; password: string; remember?: boolean } }>(
    "/auth/login",
    { schema: { body: loginBodySchema } },
    async (request, reply) => {
      const { email, password, remember } = request.body;

      const user = await findUserByEmail(email);
      if (!user) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatches) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      const token = fastify.jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
        },
        remember ? { expiresIn: REMEMBER_ME_EXPIRES_IN } : undefined
      );

      return {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      };
    }
  );

  fastify.get("/auth/me", { onRequest: [fastify.authenticate] }, async (request) => {
    return { user: request.user };
  });
}
