import type { FastifyInstance } from "fastify";
import { simpleParser } from "mailparser";
import {
  getAccountById,
  listAccessibleAccountsForUser,
  listAllActiveAccounts,
  userHasAccountAccess,
} from "../db/emailAccounts.js";
import { withImapClient } from "../lib/mail/imapClient.js";
import { toSmtpOptions } from "../lib/mail/config.js";
import { mapFullMessage, mapSummary } from "../lib/mail/messageMapper.js";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";

const sendBodySchema = {
  type: "object",
  required: ["to", "subject", "text"],
  properties: {
    to: { type: "array", items: { type: "string" }, minItems: 1 },
    cc: { type: "array", items: { type: "string" } },
    bcc: { type: "array", items: { type: "string" } },
    subject: { type: "string" },
    text: { type: "string" },
    inReplyToUid: { type: "integer" },
    inReplyToFolder: { type: "string" },
  },
} as const;

const flagsBodySchema = {
  type: "object",
  properties: {
    seen: { type: "boolean" },
    flagged: { type: "boolean" },
  },
} as const;

interface SendBody {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  inReplyToUid?: number;
  inReplyToFolder?: string;
}

// Adminok minden fiókhoz hozzáférnek — a jövőben létrehozottakhoz is,
// külön hozzáférés-kiosztás nélkül. Sima felhasználóknál az explicit
// email_account_access bejegyzés dönt.
async function requireAccess(accountId: number, userId: number, role: "admin" | "user"): Promise<boolean> {
  if (role === "admin") return true;
  return userHasAccountAccess(accountId, userId);
}

export default async function emailAccountsRoutes(fastify: FastifyInstance) {
  fastify.get("/email-accounts", { onRequest: [fastify.authenticate] }, async (request) => {
    const accounts =
      request.user.role === "admin"
        ? await listAllActiveAccounts()
        : await listAccessibleAccountsForUser(request.user.sub);
    return { accounts };
  });

  fastify.get<{ Params: { id: string } }>(
    "/email-accounts/:id/folders",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const accountId = Number(request.params.id);
      if (!(await requireAccess(accountId, request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a fiókhoz" });
      }
      const account = await getAccountById(accountId);
      if (!account) return reply.code(404).send({ error: "Account not found" });

      const folders = await withImapClient(account, async (client) => {
        const list = await client.list();
        return list.map((f) => ({ path: f.path, name: f.name, specialUse: f.specialUse ?? null }));
      });
      return { folders };
    }
  );

  fastify.get<{ Params: { id: string }; Querystring: { folder?: string; limit?: string; beforeUid?: string } }>(
    "/email-accounts/:id/messages",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const accountId = Number(request.params.id);
      if (!(await requireAccess(accountId, request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a fiókhoz" });
      }
      const account = await getAccountById(accountId);
      if (!account) return reply.code(404).send({ error: "Account not found" });

      const folder = request.query.folder ?? "INBOX";
      const limit = Math.min(Number(request.query.limit ?? 30), 100);
      const beforeUid = request.query.beforeUid ? Number(request.query.beforeUid) : undefined;

      const messages = await withImapClient(account, async (client) => {
        const mailbox = await client.mailboxOpen(folder, { readOnly: true });
        if (mailbox.exists === 0) return [];

        // UID-tartomány: legújabbtól visszafelé, beforeUid alatt, legfeljebb `limit` darab.
        const range = beforeUid ? `1:${beforeUid - 1}` : "1:*";
        const uids = await client.search({ uid: range }, { uid: true });
        if (!uids || uids.length === 0) return [];
        const pageUids = uids.sort((a, b) => b - a).slice(0, limit);
        if (pageUids.length === 0) return [];

        const results = [];
        for await (const msg of client.fetch(pageUids, { envelope: true, flags: true, uid: true })) {
          results.push(mapSummary(msg));
        }
        return results.sort((a, b) => b.uid - a.uid);
      });

      return { messages };
    }
  );

  fastify.get<{ Params: { id: string; uid: string }; Querystring: { folder?: string; peek?: string } }>(
    "/email-accounts/:id/messages/:uid",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const accountId = Number(request.params.id);
      if (!(await requireAccess(accountId, request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a fiókhoz" });
      }
      const account = await getAccountById(accountId);
      if (!account) return reply.code(404).send({ error: "Account not found" });

      const folder = request.query.folder ?? "INBOX";
      const uid = Number(request.params.uid);
      const peek = request.query.peek === "1";

      const message = await withImapClient(account, async (client) => {
        await client.mailboxOpen(folder);
        const download = await client.download(String(uid), undefined, { uid: true });
        const parsed = await simpleParser(download.content);
        if (!peek) {
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        }
        return mapFullMessage(uid, parsed);
      });

      return { message };
    }
  );

  fastify.post<{ Params: { id: string; uid: string }; Querystring: { folder?: string }; Body: { seen?: boolean; flagged?: boolean } }>(
    "/email-accounts/:id/messages/:uid/flags",
    { onRequest: [fastify.authenticate], schema: { body: flagsBodySchema } },
    async (request, reply) => {
      const accountId = Number(request.params.id);
      if (!(await requireAccess(accountId, request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a fiókhoz" });
      }
      const account = await getAccountById(accountId);
      if (!account) return reply.code(404).send({ error: "Account not found" });

      const folder = request.query.folder ?? "INBOX";
      const uid = String(Number(request.params.uid));
      const { seen, flagged } = request.body;

      await withImapClient(account, async (client) => {
        await client.mailboxOpen(folder);
        const addFlags: string[] = [];
        const removeFlags: string[] = [];
        if (seen === true) addFlags.push("\\Seen");
        if (seen === false) removeFlags.push("\\Seen");
        if (flagged === true) addFlags.push("\\Flagged");
        if (flagged === false) removeFlags.push("\\Flagged");
        if (addFlags.length) await client.messageFlagsAdd(uid, addFlags, { uid: true });
        if (removeFlags.length) await client.messageFlagsRemove(uid, removeFlags, { uid: true });
      });

      return { ok: true };
    }
  );

  fastify.post<{ Params: { id: string }; Body: SendBody }>(
    "/email-accounts/:id/send",
    { onRequest: [fastify.authenticate], schema: { body: sendBodySchema } },
    async (request, reply) => {
      const accountId = Number(request.params.id);
      if (!(await requireAccess(accountId, request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez a fiókhoz" });
      }
      const account = await getAccountById(accountId);
      if (!account) return reply.code(404).send({ error: "Account not found" });

      const { to, cc, bcc, subject, text } = request.body;
      const mailOptions = {
        from: { name: account.from_name, address: account.from_address },
        to,
        cc,
        bcc,
        subject,
        text,
      };

      const raw: Buffer = await new MailComposer(mailOptions).compile().build();

      const transporter = nodemailer.createTransport(toSmtpOptions(account));
      await transporter.sendMail({ raw });

      // Best-effort: bekerül-e egy másolat a Sent mappába. Ha ez elhasal
      // (pl. nincs \Sent mappa), az ne buktassa a sikeres küldést.
      try {
        await withImapClient(account, async (client) => {
          const folders = await client.list();
          const sentFolder = folders.find((f) => f.specialUse === "\\Sent");
          if (sentFolder) {
            await client.append(sentFolder.path, raw, ["\\Seen"]);
          }
        });
      } catch {
        // szándékosan elnyelve
      }

      return { ok: true };
    }
  );
}
