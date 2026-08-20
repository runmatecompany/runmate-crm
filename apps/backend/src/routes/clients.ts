import type { FastifyInstance } from "fastify";
import type { Readable } from "node:stream";
import {
  createClient,
  deleteClient,
  getClientById,
  hasClientsAccess,
  listAllClients,
  updateClientDetails,
  updateClientStatus,
  type ClientStatus,
} from "../db/clients.js";
import { getClientAiProfile, upsertClientAiProfile } from "../db/clientAiProfiles.js";
import { getClientOnboarding, upsertClientOnboarding } from "../db/clientOnboarding.js";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import {
  beginClippingUpload,
  ClippingUploadError,
  confirmCurrentMonthClippingPayment,
  ensureVagoFolderAccess,
  getClippingProgress,
  uploadNumberedClip,
} from "../lib/clipping.js";
import { getUserDriveConnection } from "../db/userGoogleDrive.js";
import { getUserAuthorizedClient } from "../lib/googleDrive/personalOauth.js";
import { provisionClientDriveFolders } from "../lib/googleDrive/onboarding.js";

const clientDetailsSchema = {
  companyName: { type: "string", minLength: 1 },
  contactName: { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  address: { type: "string" },
  notes: { type: "string" },
  clientType: { type: "string", enum: ["monthly", "one_off"] },
};

const createClientBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: clientDetailsSchema,
} as const;

const updateClientBodySchema = {
  type: "object",
  required: ["companyName"],
  properties: clientDetailsSchema,
} as const;

interface ClientDetailsBody {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  clientType?: "monthly" | "one_off";
}

const clientStatusBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["active", "paused", "closed"] },
  },
} as const;

const aiProfileBodySchema = {
  type: "object",
  properties: {
    brandVoice: { type: "string" },
    targetAudience: { type: "string" },
    visualDirection: { type: "string" },
    forbiddenTopics: { type: "string" },
    ctaStyle: { type: "string" },
    platformNotes: { type: "string" },
    referenceLinks: { type: "string" },
    hasSocialPresence: { type: "boolean" },
    inspirationBrands: { type: "string" },
    brandMission: { type: "string" },
  },
} as const;

interface AiProfileBody {
  brandVoice?: string;
  targetAudience?: string;
  visualDirection?: string;
  forbiddenTopics?: string;
  ctaStyle?: string;
  platformNotes?: string;
  referenceLinks?: string;
  hasSocialPresence?: boolean;
  inspirationBrands?: string;
  brandMission?: string;
}

const onboardingBodySchema = {
  type: "object",
  properties: {
    industry: { type: "string" },
    businessDescription: { type: "string" },
    websiteUrl: { type: "string" },
    brandAssetsLocation: { type: "string" },
    serviceWebsiteBuild: { type: "boolean" },
    serviceLandingPage: { type: "boolean" },
    serviceShortVideos: { type: "boolean" },
    serviceImagePosts: { type: "boolean" },
    serviceClipping: { type: "boolean" },
    websitePagesCount: { type: "integer" },
    websiteDomainHosting: { type: "string" },
    websiteReferenceNotes: { type: "string" },
    landingGoal: { type: "string" },
    landingDomainHosting: { type: "string" },
    landingReferenceNotes: { type: "string" },
    shortVideosPlatforms: { type: "array", items: { type: "string" } },
    imagePostsPlatforms: { type: "array", items: { type: "string" } },
    clippingPlatforms: { type: "array", items: { type: "string" } },
    clippingSourceFolderUrl: { type: "string" },
    clippingDailyTarget: { type: "integer" },
    monthlyVideoTarget: { type: "integer" },
    monthlyPostTarget: { type: "integer" },
    collaborationGoals: { type: "string" },
    approvalProcessNotes: { type: "string" },
    approverName: { type: "string" },
    approverEmail: { type: "string" },
    otherNotes: { type: "string" },
  },
} as const;

interface OnboardingBody {
  industry?: string;
  businessDescription?: string;
  websiteUrl?: string;
  brandAssetsLocation?: string;
  serviceWebsiteBuild?: boolean;
  serviceLandingPage?: boolean;
  serviceShortVideos?: boolean;
  serviceImagePosts?: boolean;
  serviceClipping?: boolean;
  websitePagesCount?: number;
  websiteDomainHosting?: string;
  websiteReferenceNotes?: string;
  landingGoal?: string;
  landingDomainHosting?: string;
  landingReferenceNotes?: string;
  shortVideosPlatforms?: string[];
  imagePostsPlatforms?: string[];
  clippingPlatforms?: string[];
  clippingSourceFolderUrl?: string;
  clippingDailyTarget?: number;
  monthlyVideoTarget?: number;
  monthlyPostTarget?: number;
  collaborationGoals?: string;
  approvalProcessNotes?: string;
  approverName?: string;
  approverEmail?: string;
  otherNotes?: string;
}

// Modul-szintű hozzáférés: admin mindig, más csak akkor, ha az admin
// felvette a clients_access listára.
export async function canAccessClientsModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasClientsAccess(userId));
}

export default async function clientsRoutes(fastify: FastifyInstance) {
  fastify.get("/clients", { onRequest: [fastify.authenticate] }, async (request) => {
    const access = await canAccessClientsModule(request.user.sub, request.user.role);
    return { clients: access ? await listAllClients() : [], hasAccess: access };
  });

  fastify.get<{ Params: { id: string } }>("/clients/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
    }
    const client = await getClientById(Number(request.params.id));
    if (!client) return reply.code(404).send({ error: "Client not found" });
    return { client };
  });

  fastify.post<{ Body: ClientDetailsBody }>(
    "/clients",
    { onRequest: [fastify.authenticate], schema: { body: createClientBodySchema } },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const client = await createClient({ ...request.body, createdBy: request.user.sub });

      // Onboarding: Drive-mappastruktúra automatikus létrehozása. Best-effort
      // — ha nincs Google-kapcsolat vagy hibázik, az ügyfél-létrehozás akkor
      // is sikeres marad, csak logoljuk.
      try {
        await provisionClientDriveFolders(client);
      } catch (err) {
        fastify.log.error(err, "Drive folder onboarding failed for new client");
      }

      return reply.code(201).send({ client: (await getClientById(client.id))! });
    }
  );

  fastify.put<{ Params: { id: string }; Body: ClientDetailsBody }>(
    "/clients/:id",
    { onRequest: [fastify.authenticate], schema: { body: updateClientBodySchema } },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const existing = await getClientById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Client not found" });
      const client = await updateClientDetails(existing.id, request.body);
      return { client };
    }
  );

  fastify.delete<{ Params: { id: string } }>("/clients/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin törölhet ügyfelet" });
    }
    const deleted = await deleteClient(Number(request.params.id));
    if (!deleted) return reply.code(404).send({ error: "Client not found" });
    return { ok: true };
  });

  // Az aktív/passzív (szüneteltetve/lezárva) állapotváltás külön, gyors
  // művelet — nem kell a teljes szerkesztő-formot megnyitni hozzá, ugyanaz
  // a minta, mint a manual_tasks állapot-váltása (routes/tasks.ts).
  fastify.patch<{ Params: { id: string }; Body: { status: ClientStatus } }>(
    "/clients/:id/status",
    { onRequest: [fastify.authenticate], schema: { body: clientStatusBodySchema } },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const client = await updateClientStatus(Number(request.params.id), request.body.status);
      if (!client) return reply.code(404).send({ error: "Client not found" });
      return { client };
    }
  );

  // Az AI-profilt az Ügyfelek modul VAGY a Social Media modul hozzáférésével
  // rendelkezők olvashatják (a script-írás nézet emlékeztető panelje is ezt
  // hívja) — a szerkesztés (PUT) viszont márka-kritikus adat, admin-only.
  fastify.get<{ Params: { id: string } }>(
    "/clients/:id/ai-profile",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const access =
        role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
      if (!access) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      const profile = (await getClientAiProfile(clientId)) ?? null;
      return { profile };
    }
  );

  fastify.put<{ Params: { id: string }; Body: AiProfileBody }>(
    "/clients/:id/ai-profile",
    { onRequest: [fastify.authenticate], schema: { body: aiProfileBodySchema } },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin szerkesztheti az AI-profilt" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      const profile = await upsertClientAiProfile(clientId, request.body);
      return { profile };
    }
  );

  // Az onboarding-profilt (vállalkozás adatai + amit vállalunk nekik) az
  // Ügyfelek VAGY a Social Media modul hozzáférésével rendelkezők
  // olvashatják (a tartalom-létrehozás is ebből szűri a platformokat) — a
  // szerkesztés az Ügyfelek modul hozzáféréssel rendelkező bárkinek elérhető,
  // NEM admin-only, mert az onboarding-hívást lebonyolító kolléga nem
  // feltétlen admin.
  fastify.get<{ Params: { id: string } }>(
    "/clients/:id/onboarding",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const access =
        role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
      if (!access) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      const profile = (await getClientOnboarding(clientId)) ?? null;
      return { profile };
    }
  );

  fastify.put<{ Params: { id: string }; Body: OnboardingBody }>(
    "/clients/:id/onboarding",
    { onRequest: [fastify.authenticate], schema: { body: onboardingBodySchema } },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      const profile = await upsertClientOnboarding(clientId, request.body, request.user.sub);
      return { profile };
    }
  );

  // Clippelés-nél a kész klippek száma nem a rendszerben nyilvántartott
  // tartalmakból jön, hanem élőben a havi kimeneti Drive-mappa
  // fájlneveiből (lásd lib/clipping.ts) — ezért ez egy külön, lassabb
  // (Drive API-t hívó) végpont, nem a sima ügyfél-listázás része.
  fastify.get<{ Params: { id: string } }>(
    "/clients/:id/clipping-progress",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const access =
        role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
      if (!access) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      const progress = await getClippingProgress(clientId);
      return { progress };
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/clients/:id/clipping-progress/confirm-payment",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin hagyhatja jóvá a fizetést" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      await confirmCurrentMonthClippingPayment(clientId);
      const progress = await getClippingProgress(clientId);
      return { progress };
    }
  );

  // A vágó a kész klipeket egyenként, szigorúan sorban tölti fel
  // (ClipUploadModal.tsx) — minden fájl saját kérés, egy opcionális
  // "number" mezővel, amit a frontend a getClippingProgress válaszából
  // ismer és növel feltöltésenként. Ha ez megvan, a szerver nem kénytelen
  // fájlonként újra átvizsgálni a teljes Drive-mappát a következő szabad
  // sorszámért (ez sokat számít a hónap végén, amikor már 80-90 fájl van
  // bent) — ez volt a fő oka annak, hogy a feltöltés lelassult, amikor
  // fájlonként külön kérésre álltunk át a progress-csík kedvéért. A
  // mappa-scan csak akkor fut le, ha a "number" mező hiányzik (régebbi
  // kliens / fallback).
  fastify.post<{ Params: { id: string } }>(
    "/clients/:id/clipping-progress/upload",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const access = role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
      if (!access) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });

      let explicitNumber: number | undefined;
      let uploaded = false;
      try {
        for await (const part of request.parts()) {
          if (part.type === "field" && part.fieldname === "number") {
            const n = Number(part.value);
            if (Number.isFinite(n) && n > 0) explicitNumber = n;
          } else if (part.type === "file" && part.fieldname === "file") {
            const ctx = await beginClippingUpload(clientId, explicitNumber);
            await uploadNumberedClip(ctx, ctx.nextNumber, part.filename, part.mimetype, part.file as Readable);
            uploaded = true;
          }
        }
      } catch (err) {
        if (err instanceof ClippingUploadError) {
          return reply.code(400).send({ error: err.message });
        }
        request.log.error(err, "Clipping upload failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlt" });
      }

      if (!uploaded) {
        return reply.code(400).send({ error: "Nincs kiválasztott fájl" });
      }

      const progress = await getClippingProgress(clientId);
      return reply.code(201).send({ progress, uploaded: 1 });
    }
  );

  // Gyors feltöltési út: ha a vágó összekötötte a saját Google-fiókját
  // (Beállítások > Profilom), ez az endpoint nem fogadja magát a fájlt —
  // csak előkészíti a feltöltést (jogosultság-ellenőrzés, sorszám,
  // a szükséges esetben névre szóló mappa-jog automatikus megadása a
  // vágónak — ensureVagoFolderAccess), majd egy rövid élettartamú Google
  // access tokent ad vissza. A tényleges videó-bájtok innentől a vágó
  // gépéről MENNEK EGYENESEN a Google Drive-ra, a RunMate szervert
  // megkerülve — ez oldja meg, hogy a feltöltés sebessége ne a szerver
  // (mért ~10 Mbps) feltöltési sávszélességétől függjön.
  fastify.post<{ Params: { id: string }; Body: { number?: number } }>(
    "/clients/:id/clipping-progress/upload-session",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const access = role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
      if (!access) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });

      const connection = await getUserDriveConnection(userId);
      if (!connection) {
        return reply.code(400).send({
          error: "Nincs összekötve a saját Google-fiókod — kösd össze a Beállítások > Profilom oldalon a gyors feltöltéshez",
        });
      }

      let ctx;
      try {
        const explicitNumber =
          typeof request.body?.number === "number" && request.body.number > 0 ? request.body.number : undefined;
        ctx = await beginClippingUpload(clientId, explicitNumber);
        await ensureVagoFolderAccess(userId, clientId, connection.connectedEmail);
      } catch (err) {
        if (err instanceof ClippingUploadError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const userOauth = await getUserAuthorizedClient(userId);
      if (!userOauth) {
        return reply.code(400).send({ error: "A Google-kapcsolatod nem érhető el — kösd össze újra" });
      }
      const { token: accessToken } = await userOauth.getAccessToken();
      if (!accessToken) {
        return reply.code(502).send({ error: "Nem sikerült Google access tokent szerezni" });
      }

      return reply.send({ accessToken, folderId: ctx.folderId, nextNumber: ctx.nextNumber });
    }
  );
}
