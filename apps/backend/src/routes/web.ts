import type { FastifyInstance } from "fastify";
import type { OAuth2Client } from "google-auth-library";
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
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { ensureWebProjectDriveFolder } from "../lib/googleDrive/onboarding.js";
import {
  createFolder,
  createGoogleFile,
  isDriveFolder,
  listFolderChildren,
  renameItem,
  resolveBreadcrumb,
  trashItem,
  type CreatableKind,
  type DriveFolder,
  type DriveItem,
} from "../lib/googleDrive/api.js";
import { uploadStreamToFolder } from "../lib/googleDrive/upload.js";

export async function canAccessWebModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasWebAccess(userId));
}

// A beépített Drive-böngésző ugyanazt a mintát követi, mint a Social Media
// modulé (routes/googleDrive.ts), csak itt a "gyökér" nem a teljes Ügyfelek
// mappa, hanem magának a projektnek a Drive-almappája — így egy csak
// Web-hozzáféréssel rendelkező kolléga se tudjon a projekt mappáján kívülre
// navigálni. Morzsamenü-gyorsítótár, hasonlóan a Social Media Drive-hoz.
const webBreadcrumbCache = new Map<string, DriveFolder[]>();
const WEB_CREATABLE_KINDS: CreatableKind[] = ["document", "spreadsheet", "presentation"];

async function ensureWebBreadcrumb(
  oauth: OAuth2Client,
  root: DriveFolder,
  folderId: string
): Promise<DriveFolder[] | null> {
  if (folderId === root.id) return [{ id: root.id, name: root.name }];
  if (webBreadcrumbCache.has(folderId)) return webBreadcrumbCache.get(folderId)!;
  const breadcrumb = await resolveBreadcrumb(oauth, folderId, root.id);
  if (breadcrumb) webBreadcrumbCache.set(folderId, breadcrumb);
  return breadcrumb;
}

// Előfeltétel a lenti Drive-végpontokhez: a projektnek léteznie kell, a
// felhasználónak Web-hozzáféréssel kell rendelkeznie, és a projekt
// Drive-mappájának is meg kell lennie (lustán pótolva, ha még hiányzik —
// pl. ha az onboarding mentésekor még nem volt Google-kapcsolat). Null +
// hibaüzenet, ha bármelyik feltétel nem teljesül.
async function getReadyWebProjectFolder(
  projectId: number
): Promise<{ oauth: OAuth2Client; root: DriveFolder } | { error: string; status: number }> {
  const project = await getWebProjectById(projectId);
  if (!project) return { error: "Projekt nem található", status: 404 };

  const oauth = await getAuthorizedClient();
  if (!oauth) {
    return { error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)", status: 400 };
  }

  let folderId = project.drive_folder_id;
  if (!folderId) {
    folderId = await ensureWebProjectDriveFolder(project.client_id, project.id, project.title);
  }
  if (!folderId) {
    return { error: "Nem sikerült létrehozni a projekt Drive-mappáját", status: 502 };
  }
  return { oauth, root: { id: folderId, name: project.title } };
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

  // --- Projekt Drive-mappa: böngészés / feltöltés / létrehozás / átnevezés / törlés ---
  // Ugyanaz a mechanika, mint a Social Media modul beépített Drive-
  // böngészőjénél (routes/googleDrive.ts), csak a gyökér a projekt saját
  // mappájára van szűkítve.

  fastify.get<{ Params: { id: string }; Querystring: { folderId?: string } }>(
    "/web/projects/:id/drive/browse",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessWebModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
      }
      const ready = await getReadyWebProjectFolder(Number(request.params.id));
      if ("error" in ready) return reply.code(ready.status).send({ error: ready.error });
      const { oauth, root } = ready;

      const folderId = request.query.folderId || root.id;
      const breadcrumb = await ensureWebBreadcrumb(oauth, root, folderId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
      }

      const children = await listFolderChildren(oauth, folderId);
      for (const child of children) {
        if (!webBreadcrumbCache.has(child.id)) {
          webBreadcrumbCache.set(child.id, [...breadcrumb, { id: child.id, name: child.name }]);
        }
      }

      const folders = children.filter(isDriveFolder);
      const files = children.filter((item) => !isDriveFolder(item));

      return { folderId, breadcrumb, folders, files };
    }
  );

  fastify.post<{ Params: { id: string }; Body: { folderId: string; name: string; kind: "folder" | CreatableKind } }>(
    "/web/projects/:id/drive/create-item",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessWebModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
      }
      const { folderId, name, kind } = request.body;
      if (!folderId || !name?.trim()) {
        return reply.code(400).send({ error: "Hiányzó mappa vagy fájlnév" });
      }
      if (kind !== "folder" && !WEB_CREATABLE_KINDS.includes(kind)) {
        return reply.code(400).send({ error: "Ismeretlen típus" });
      }
      const ready = await getReadyWebProjectFolder(Number(request.params.id));
      if ("error" in ready) return reply.code(ready.status).send({ error: ready.error });
      const { oauth, root } = ready;

      const breadcrumb = await ensureWebBreadcrumb(oauth, root, folderId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
      }

      const file: DriveItem =
        kind === "folder"
          ? { ...(await createFolder(oauth, folderId, name.trim())), mimeType: "application/vnd.google-apps.folder" }
          : await createGoogleFile(oauth, folderId, name.trim(), kind);

      return reply.code(201).send({ file });
    }
  );

  fastify.post<{ Params: { id: string }; Body: { itemId: string; name: string } }>(
    "/web/projects/:id/drive/rename",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessWebModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
      }
      const { itemId, name } = request.body;
      if (!itemId || !name?.trim()) {
        return reply.code(400).send({ error: "Hiányzó elem vagy név" });
      }
      const ready = await getReadyWebProjectFolder(Number(request.params.id));
      if ("error" in ready) return reply.code(ready.status).send({ error: ready.error });
      const { oauth, root } = ready;

      const breadcrumb = await ensureWebBreadcrumb(oauth, root, itemId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez az elem nem érhető el innen" });
      }

      const file = await renameItem(oauth, itemId, name.trim());
      webBreadcrumbCache.delete(itemId);
      return { file };
    }
  );

  fastify.post<{ Params: { id: string }; Body: { itemId: string } }>(
    "/web/projects/:id/drive/delete",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessWebModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
      }
      const { itemId } = request.body;
      if (!itemId) return reply.code(400).send({ error: "Hiányzó elem" });

      const ready = await getReadyWebProjectFolder(Number(request.params.id));
      if ("error" in ready) return reply.code(ready.status).send({ error: ready.error });
      const { oauth, root } = ready;

      if (itemId === root.id) {
        return reply.code(400).send({ error: "A projekt gyökérmappája nem törölhető" });
      }
      const breadcrumb = await ensureWebBreadcrumb(oauth, root, itemId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez az elem nem érhető el innen" });
      }

      await trashItem(oauth, itemId);
      webBreadcrumbCache.delete(itemId);
      return { ok: true };
    }
  );

  fastify.post<{ Params: { id: string }; Querystring: { folderId?: string } }>(
    "/web/projects/:id/drive/upload",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessWebModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Web modulhoz" });
      }
      const ready = await getReadyWebProjectFolder(Number(request.params.id));
      if ("error" in ready) return reply.code(ready.status).send({ error: ready.error });
      const { oauth, root } = ready;

      const folderId = request.query.folderId || root.id;
      const breadcrumb = await ensureWebBreadcrumb(oauth, root, folderId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
      }

      try {
        let uploadedCount = 0;
        for await (const part of request.files()) {
          await uploadStreamToFolder(oauth, folderId, part.filename, part.mimetype, part.file);
          uploadedCount++;
        }
        if (uploadedCount === 0) {
          return reply.code(400).send({ error: "Nincs kiválasztott fájl" });
        }
        return { ok: true, uploadedCount };
      } catch (err) {
        request.log.error(err, "Web project Drive upload failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat" });
      }
    }
  );
}
