import type { FastifyInstance } from "fastify";
import {
  createAccount,
  deleteAccount,
  getAccountById,
  listAccountsAdmin,
  updateAccount,
  type MailSecurity,
} from "../../db/emailAccounts.js";
import { decryptSecret } from "../../lib/crypto.js";
import { testImapConnection, testSmtpConnection } from "../../lib/mail/test.js";

const securityEnum = { type: "string", enum: ["tls", "starttls", "none"] } as const;

const accountBodySchema = {
  type: "object",
  required: [
    "displayName",
    "fromName",
    "fromAddress",
    "imapHost",
    "imapPort",
    "imapSecurity",
    "imapUsername",
    "imapPassword",
    "smtpHost",
    "smtpPort",
    "smtpSecurity",
    "smtpUsername",
    "smtpPassword",
  ],
  properties: {
    displayName: { type: "string", minLength: 1 },
    fromName: { type: "string", minLength: 1 },
    fromAddress: { type: "string", format: "email" },
    imapHost: { type: "string", minLength: 1 },
    imapPort: { type: "integer", minimum: 1, maximum: 65535 },
    imapSecurity: securityEnum,
    imapUsername: { type: "string", minLength: 1 },
    imapPassword: { type: "string", minLength: 1 },
    smtpHost: { type: "string", minLength: 1 },
    smtpPort: { type: "integer", minimum: 1, maximum: 65535 },
    smtpSecurity: securityEnum,
    smtpUsername: { type: "string", minLength: 1 },
    smtpPassword: { type: "string", minLength: 1 },
  },
} as const;

const updateAccountBodySchema = {
  type: "object",
  required: [
    "displayName",
    "fromName",
    "fromAddress",
    "imapHost",
    "imapPort",
    "imapSecurity",
    "imapUsername",
    "smtpHost",
    "smtpPort",
    "smtpSecurity",
    "smtpUsername",
    "isActive",
  ],
  properties: {
    displayName: { type: "string", minLength: 1 },
    fromName: { type: "string", minLength: 1 },
    fromAddress: { type: "string", format: "email" },
    imapHost: { type: "string", minLength: 1 },
    imapPort: { type: "integer", minimum: 1, maximum: 65535 },
    imapSecurity: securityEnum,
    imapUsername: { type: "string", minLength: 1 },
    imapPassword: { type: "string" },
    smtpHost: { type: "string", minLength: 1 },
    smtpPort: { type: "integer", minimum: 1, maximum: 65535 },
    smtpSecurity: securityEnum,
    smtpUsername: { type: "string", minLength: 1 },
    smtpPassword: { type: "string" },
    isActive: { type: "boolean" },
  },
} as const;

const connectionSideSchema = {
  type: "object",
  required: ["host", "port", "security", "username"],
  properties: {
    host: { type: "string", minLength: 1 },
    port: { type: "integer", minimum: 1, maximum: 65535 },
    security: securityEnum,
    username: { type: "string", minLength: 1 },
    password: { type: "string" },
  },
} as const;

const testConnectionBodySchema = {
  type: "object",
  required: ["imap", "smtp"],
  properties: {
    accountId: { type: "integer" },
    imap: connectionSideSchema,
    smtp: connectionSideSchema,
  },
} as const;

interface AccountBody {
  displayName: string;
  fromName: string;
  fromAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  smtpUsername: string;
  smtpPassword: string;
}

interface UpdateAccountBody extends Omit<AccountBody, "imapPassword" | "smtpPassword"> {
  imapPassword?: string;
  smtpPassword?: string;
  isActive: boolean;
}

interface ConnectionSide {
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password?: string;
}

export default async function adminEmailAccountsRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get("/admin/email-accounts", async () => {
    return { accounts: await listAccountsAdmin() };
  });

  fastify.post<{ Body: AccountBody }>(
    "/admin/email-accounts",
    { schema: { body: accountBodySchema } },
    async (request, reply) => {
      const b = request.body;
      const account = await createAccount({
        displayName: b.displayName,
        fromName: b.fromName,
        fromAddress: b.fromAddress,
        imapHost: b.imapHost,
        imapPort: b.imapPort,
        imapSecurity: b.imapSecurity,
        imapUsername: b.imapUsername,
        imapPassword: b.imapPassword,
        smtpHost: b.smtpHost,
        smtpPort: b.smtpPort,
        smtpSecurity: b.smtpSecurity,
        smtpUsername: b.smtpUsername,
        smtpPassword: b.smtpPassword,
        createdBy: request.user.sub,
      });
      return reply.code(201).send({ account });
    }
  );

  fastify.put<{ Params: { id: string }; Body: UpdateAccountBody }>(
    "/admin/email-accounts/:id",
    { schema: { body: updateAccountBodySchema } },
    async (request, reply) => {
      const id = Number(request.params.id);
      const b = request.body;
      const account = await updateAccount(id, {
        displayName: b.displayName,
        fromName: b.fromName,
        fromAddress: b.fromAddress,
        imapHost: b.imapHost,
        imapPort: b.imapPort,
        imapSecurity: b.imapSecurity,
        imapUsername: b.imapUsername,
        imapPassword: b.imapPassword,
        smtpHost: b.smtpHost,
        smtpPort: b.smtpPort,
        smtpSecurity: b.smtpSecurity,
        smtpUsername: b.smtpUsername,
        smtpPassword: b.smtpPassword,
        isActive: b.isActive,
      });
      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }
      return { account };
    }
  );

  fastify.delete<{ Params: { id: string } }>("/admin/email-accounts/:id", async (request, reply) => {
    const deleted = await deleteAccount(Number(request.params.id));
    if (!deleted) {
      return reply.code(404).send({ error: "Account not found" });
    }
    return { ok: true };
  });

  // Kapcsolat tesztelése — mentés előtt is hívható, hogy az admin azonnal
  // lássa, ha rossz jelszót/hostot adott meg. Ha egy jelszó mező üres és van
  // accountId, a már mentett (visszafejtett) jelszót használjuk helyette,
  // hogy szerkesztéskor ne kelljen mindig újra begépelni.
  fastify.post<{ Body: { accountId?: number; imap: ConnectionSide; smtp: ConnectionSide } }>(
    "/admin/email-accounts/test-connection",
    { schema: { body: testConnectionBodySchema } },
    async (request, reply) => {
      const { accountId, imap, smtp } = request.body;
      let existing = null;
      if (accountId && (!imap.password || !smtp.password)) {
        existing = (await getAccountById(accountId)) ?? null;
      }

      const imapPassword = imap.password || (existing ? decryptSecret(existing.imap_password_enc) : "");
      const smtpPassword = smtp.password || (existing ? decryptSecret(existing.smtp_password_enc) : "");

      if (!imapPassword || !smtpPassword) {
        return reply.code(400).send({ error: "Jelszó megadása kötelező" });
      }

      const [imapResult, smtpResult] = await Promise.all([
        testImapConnection({ ...imap, password: imapPassword }),
        testSmtpConnection({ ...smtp, password: smtpPassword }),
      ]);
      return { imap: imapResult, smtp: smtpResult };
    }
  );
}
