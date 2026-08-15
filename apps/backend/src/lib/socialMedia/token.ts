import { createHash, randomBytes } from "node:crypto";

export const APPROVAL_TOKEN_TTL_DAYS = 30;

// A linkben csak a nyers, magas entrópiájú token utazik — az adatbázisban
// kizárólag a hash-e kerül tárolásra, hogy egy DB-dump önmagában ne adjon
// felhasználható jóváhagyó linket.
export function generateApprovalToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashApprovalToken(token) };
}

export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function approvalTokenExpiry(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + APPROVAL_TOKEN_TTL_DAYS);
  return expires;
}
