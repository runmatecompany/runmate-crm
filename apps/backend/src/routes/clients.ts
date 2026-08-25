import type { FastifyInstance } from "fastify";
import type { Readable } from "node:stream";
import {
  cancelClientDeletionRequest,
  createClient,
  createClientDeletionRequest,
  deleteClient,
  getClientById,
  getClientDeletionRequest,
  hasClientsAccess,
  listAllClients,
  updateClientDetails,
  updateClientStatus,
  type ClientStatus,
} from "../db/clients.js";
import { createManualTask } from "../db/tasks.js";
import { listClientContacts, replaceClientContacts } from "../db/clientContacts.js";
import { getClientAiProfile, upsertClientAiProfile } from "../db/clientAiProfiles.js";
import { getClientOnboarding, upsertClientOnboarding } from "../db/clientOnboarding.js";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import { listClippingPostQueue, removeClippingPostQueueEntry } from "../db/clippingPostQueue.js";
import {
  beginClippingUpload,
  ClippingUploadError,
  confirmCurrentMonthClippingPayment,
  ensureVagoFolderAccess,
  getClippingProgress,
  sendClippingForPosting,
  uploadNumberedClip,
} from "../lib/clipping.js";
import { getUserDriveConnection } from "../db/userGoogleDrive.js";
import { getUserAuthorizedClient } from "../lib/googleDrive/personalOauth.js";
import { provisionClientDriveFolders, ensureWebProjectDriveFolder } from "../lib/googleDrive/onboarding.js";
import { getWebProjectByClientAndType } from "../db/webProjects.js";

const clientContactSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    email: { type: "string" },
    phone: { type: "string" },
  },
} as const;

const clientDetailsSchema = {
  companyName: { type: "string", minLength: 1 },
  contactName: { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  address: { type: "string" },
  notes: { type: "string" },
  clientType: { type: "string", enum: ["monthly", "one_off"] },
  billingName: { type: "string" },
  taxNumber: { type: "string" },
  billingAddress: { type: "string" },
  bankAccount: { type: "string" },
  contacts: { type: "array", items: clientContactSchema },
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

interface ClientContactBody {
  name: string;
  email?: string;
  phone?: string;
}

interface ClientDetailsBody {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  clientType?: "monthly" | "one_off";
  billingName?: string;
  taxNumber?: string;
  billingAddress?: string;
  bankAccount?: string;
  contacts?: ClientContactBody[];
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
      if (request.body.contacts) {
        await replaceClientContacts(existing.id, request.body.contacts);
      }
      return { client };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/clients/:id/contacts",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      return { contacts: await listClientContacts(clientId) };
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

  // Nem-admin nem törölhet közvetlenül — helyette kérelmet küld, ami egy
  // feladatként jelenik meg a Feladatok modulban, admin számára. A
  // client_deletion_requests UNIQUE(client_id) miatt egyszerre csak egy
  // aktív kérelem lehet ügyfelenként.
  fastify.post<{ Params: { id: string } }>(
    "/clients/:id/deletion-request",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const clientId = Number(request.params.id);
      const client = await getClientById(clientId);
      if (!client) return reply.code(404).send({ error: "Client not found" });

      const existing = await getClientDeletionRequest(clientId);
      if (existing) {
        return reply.code(400).send({ error: "Már van folyamatban lévő törlési kérelem ehhez az ügyfélhez" });
      }

      const task = await createManualTask({
        title: `Ügyfél törlési kérelem: ${client.company_name}`,
        description: `${request.user.email} törlésre kérelmezte a(z) "${client.company_name}" ügyfelet az Ügyfelek modulban.`,
        createdBy: request.user.sub,
      });
      await createClientDeletionRequest(clientId, request.user.sub, task.id);

      return reply.code(201).send({ client: (await getClientById(clientId))! });
    }
  );

  // Visszavonás — a kérelmező maga, vagy admin bármikor visszavonhatja
  // (admin ezzel el is utasíthatja a kérelmet anélkül, hogy törölné az
  // ügyfelet).
  fastify.delete<{ Params: { id: string } }>(
    "/clients/:id/deletion-request",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!(await canAccessClientsModule(request.user.sub, request.user.role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed az Ügyfelek modulhoz" });
      }
      const clientId = Number(request.params.id);
      const existing = await getClientDeletionRequest(clientId);
      if (!existing) return reply.code(404).send({ error: "Nincs folyamatban lévő törlési kérelem" });
      if (request.user.role !== "admin" && existing.requestedBy !== request.user.sub) {
        return reply.code(403).send({ error: "Csak a kérelmező vagy admin vonhatja vissza a kérelmet" });
      }
      await cancelClientDeletionRequest(clientId);
      return { client: await getClientById(clientId) };
    }
  );

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

      // Web-projekt Drive-mappa: ugyanaz a best-effort minta, mint az
      // ügyfél-mappa onboardingkori létrehozásánál — ha nincs Google-kapcsolat
      // vagy hibázik, az onboarding-mentés akkor is sikeres marad.
      try {
        if (request.body.serviceWebsiteBuild) {
          const project = await getWebProjectByClientAndType(clientId, "website");
          if (project) await ensureWebProjectDriveFolder(clientId, project.id, project.title);
        }
        if (request.body.serviceLandingPage) {
          const project = await getWebProjectByClientAndType(clientId, "landing_page");
          if (project) await ensureWebProjectDriveFolder(clientId, project.id, project.title);
        }
      } catch (err) {
        fastify.log.error(err, "Drive folder provisioning failed for web project");
      }

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

  // Miután megvan a havi klip-mennyiség, a vágó (vagy admin) átküldheti a
  // havi adagot a "Posztolni valók" modulba — innentől eltűnik a
  // "Vágásra vár" oszlopból (lásd sendClippingForPosting).
  fastify.post<{ Params: { id: string } }>(
    "/clients/:id/clipping-progress/send-for-posting",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const access = role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
      if (!access) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
      }
      const clientId = Number(request.params.id);
      if (!(await getClientById(clientId))) return reply.code(404).send({ error: "Client not found" });
      try {
        const result = await sendClippingForPosting(clientId);
        return result;
      } catch (err) {
        if (err instanceof ClippingUploadError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  // A "Posztolni valók" modul klip-adagok listája — ide kerülnek a
  // "Küldés posztolásra" gombbal átküldött havi klip-adagok, amíg valaki
  // ki nem posztolja és jelzi "posztolva"-ként.
  fastify.get("/clipping-post-queue", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId, role } = request.user;
    const access = role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
    if (!access) {
      return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
    }
    const entries = await listClippingPostQueue();
    return { entries };
  });

  fastify.post<{ Params: { id: string } }>(
    "/clipping-post-queue/:id/posted",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      const access = role === "admin" || (await hasClientsAccess(userId)) || (await hasSocialMediaAccess(userId));
      if (!access) {
        return reply.code(403).send({ error: "Nincs hozzáférésed ehhez" });
      }
      const removed = await removeClippingPostQueueEntry(Number(request.params.id));
      if (!removed) return reply.code(404).send({ error: "Bejegyzés nem található" });
      return { ok: true };
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
