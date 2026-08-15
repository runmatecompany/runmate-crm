import { pool } from "../../db/pool.js";
import {
  getContentItemById,
  type ContentItemRow,
  type ContentStatus,
} from "../../db/contentItems.js";
import { getNextApprovalVersion, getPendingApproval, markApprovalDecided, type ApprovalType } from "../../db/contentApprovals.js";
import { approvalTokenExpiry, generateApprovalToken } from "./token.js";
import { sendApprovalRequestEmail } from "./notify.js";

export type TransitionAction =
  | "send_script_for_approval"
  | "approve_script"
  | "reject_script"
  | "upload_raw"
  | "send_edit_for_approval"
  | "approve_edit"
  | "reject_edit"
  | "schedule";

export interface TransitionPayload {
  rawMediaUrl?: string;
  scheduledPublishAt?: string;
  feedback?: string;
}

export class TransitionError extends Error {}

const EXPECTED_FROM: Record<TransitionAction, ContentStatus> = {
  send_script_for_approval: "script_writing",
  approve_script: "script_review",
  reject_script: "script_review",
  upload_raw: "shoot_done",
  send_edit_for_approval: "editing",
  approve_edit: "edit_review",
  reject_edit: "edit_review",
  schedule: "scheduling",
};

function assertStatus(item: ContentItemRow, action: TransitionAction) {
  const expected = EXPECTED_FROM[action];
  if (item.status !== expected) {
    throw new TransitionError(
      `A(z) "${action}" akció csak "${expected}" állapotból hajtható végre, a jelenlegi állapot: "${item.status}"`
    );
  }
}

async function sendForApproval(
  item: ContentItemRow,
  type: ApprovalType,
  toStatus: ContentStatus,
  snapshot: string
): Promise<ContentItemRow> {
  if (!snapshot.trim()) {
    const what = type === "script" ? "A script szövege" : "A vágott anyag linkje";
    throw new TransitionError(`${what} még nincs kitöltve, nem küldhető jóváhagyásra`);
  }

  const version = await getNextApprovalVersion(item.id, type);
  const { token, hash } = generateApprovalToken();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE content_items SET status = $2, updated_at = now() WHERE id = $1`, [item.id, toStatus]);
    await client.query(
      `INSERT INTO content_approvals (content_item_id, type, version, snapshot, token_hash, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [item.id, type, version, snapshot, hash, approvalTokenExpiry()]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const updated = await getContentItemById(item.id);
  // A DB-állapot már elmentve — ha az emailküldés itt hibázik (pl. nincs
  // PUBLIC_URL vagy küldő fiók beállítva), a hívó felé továbbdobjuk a hibát,
  // de az elem állapota és a jóváhagyás sora megmarad: az "Emlékeztető"
  // gombbal később újraküldhető, nem kell az egész lépést megismételni.
  await sendApprovalRequestEmail(updated!, type, version, token);
  return updated!;
}

async function decideApproval(
  item: ContentItemRow,
  type: ApprovalType,
  toStatus: ContentStatus,
  decision: "approved" | "rejected",
  decidedByName: string,
  feedback: string | undefined
): Promise<ContentItemRow> {
  const pending = await getPendingApproval(item.id, type);
  if (!pending) {
    throw new TransitionError("Nincs függő jóváhagyás ehhez a tartalomhoz — ez inkonzisztens állapotot jelez");
  }
  if (decision === "rejected" && !feedback?.trim()) {
    throw new TransitionError("Módosítás kéréséhez kötelező megadni, mit kell változtatni");
  }

  await markApprovalDecided(pending.id, { status: decision, decidedByName, feedback });
  await pool.query(`UPDATE content_items SET status = $2, updated_at = now() WHERE id = $1`, [item.id, toStatus]);
  return (await getContentItemById(item.id))!;
}

// Az egyetlen belépési pont minden állapotváltáshoz — sem a belső gombok,
// sem a publikus jóváhagyó link nem írja át máshol a content_items.status
// mezőt közvetlenül. A decidedByName mindkét hívó esetén egy sima név
// (kolléga neve manuális rögzítésnél, vagy az ügyfél által beírt név a
// publikus linkről).
export async function transitionContentItem(
  itemId: number,
  action: TransitionAction,
  payload: TransitionPayload,
  decidedByName?: string
): Promise<ContentItemRow> {
  const item = await getContentItemById(itemId);
  if (!item) {
    throw new TransitionError("A tartalom nem található");
  }
  assertStatus(item, action);

  switch (action) {
    case "send_script_for_approval":
      return sendForApproval(item, "script", "script_review", item.script_content ?? "");

    case "approve_script":
      return decideApproval(item, "script", "shoot_done", "approved", decidedByName ?? "Ismeretlen", undefined);

    case "reject_script":
      return decideApproval(item, "script", "script_writing", "rejected", decidedByName ?? "Ismeretlen", payload.feedback);

    case "upload_raw": {
      if (!payload.rawMediaUrl?.trim()) throw new TransitionError("A nyersanyag linkje kötelező");
      await pool.query(`UPDATE content_items SET status='editing', raw_media_url=$2, updated_at=now() WHERE id=$1`, [
        itemId,
        payload.rawMediaUrl.trim(),
      ]);
      return (await getContentItemById(itemId))!;
    }

    case "send_edit_for_approval":
      return sendForApproval(item, "edit", "edit_review", item.edited_media_url ?? "");

    case "approve_edit":
      return decideApproval(item, "edit", "scheduling", "approved", decidedByName ?? "Ismeretlen", undefined);

    case "reject_edit":
      return decideApproval(item, "edit", "editing", "rejected", decidedByName ?? "Ismeretlen", payload.feedback);

    case "schedule": {
      if (!payload.scheduledPublishAt) throw new TransitionError("Az időzítés dátuma kötelező");
      // Nincs külön ütemező/cron: a "published" állapot azt jelenti, hogy a
      // tartalom át lett adva/rögzítve közzétételre, nem azt, hogy a
      // scheduled_publish_at pillanatában automatikusan élesedik.
      await pool.query(
        `UPDATE content_items SET status='published', scheduled_publish_at=$2, published_at=now(), updated_at=now() WHERE id=$1`,
        [itemId, payload.scheduledPublishAt]
      );
      return (await getContentItemById(itemId))!;
    }
  }
}
