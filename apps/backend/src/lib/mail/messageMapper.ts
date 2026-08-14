import type { FetchMessageObject, MessageAddressObject } from "imapflow";
import type { AddressObject, ParsedMail } from "mailparser";

export interface MailAddress {
  name: string | null;
  address: string | null;
}

export interface MailMessageSummary {
  uid: number;
  subject: string | null;
  from: MailAddress | null;
  date: string | null;
  seen: boolean;
  flagged: boolean;
}

export interface MailMessage {
  uid: number;
  subject: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  date: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
}

function toAddress(addr?: MessageAddressObject): MailAddress | null {
  if (!addr) return null;
  return { name: addr.name ?? null, address: addr.address ?? null };
}

export function mapSummary(msg: FetchMessageObject): MailMessageSummary {
  return {
    uid: msg.uid,
    subject: msg.envelope?.subject ?? null,
    from: toAddress(msg.envelope?.from?.[0]),
    date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
    seen: !!msg.flags?.has("\\Seen"),
    flagged: !!msg.flags?.has("\\Flagged"),
  };
}

function flattenAddresses(value?: AddressObject | AddressObject[]): MailAddress[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((a) => a.value.map((v) => ({ name: v.name ?? null, address: v.address ?? null })));
}

export function mapFullMessage(uid: number, parsed: ParsedMail): MailMessage {
  const fromEntry = parsed.from?.value[0];
  return {
    uid,
    subject: parsed.subject ?? null,
    from: fromEntry ? { name: fromEntry.name ?? null, address: fromEntry.address ?? null } : null,
    to: flattenAddresses(parsed.to),
    cc: flattenAddresses(parsed.cc),
    date: parsed.date ? parsed.date.toISOString() : null,
    text: parsed.text ?? null,
    html: typeof parsed.html === "string" ? parsed.html : null,
    messageId: parsed.messageId ?? null,
  };
}
