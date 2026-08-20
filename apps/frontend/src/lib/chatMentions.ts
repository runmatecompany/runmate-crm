import type { Colleague } from "./chat";

// Nincs se markup, se külön adatszerkezet a tageléshez — a "@Név" simán a
// sima szöveg része lesz (a komponáló mező is ezt szúrja be), a
// felismerés a küldött/kapott sima szöveg és az ismert kollégalista
// egyeztetéséből történik, kliens oldalon, rendereléskor. Ez illeszkedik
// abba, hogy a chat_messages.body mindig sima TEXT, nincs benne semmiféle
// strukturált adat.
export const EVERYONE_MENTION_NAME = "Mindenki";
export const EVERYONE_MENTION_ID = "everyone" as const;

export interface MentionCandidate {
  name: string;
  id: number | typeof EVERYONE_MENTION_ID;
}

export function buildMentionCandidates(colleagues: Colleague[]): MentionCandidate[] {
  return [
    { name: EVERYONE_MENTION_NAME, id: EVERYONE_MENTION_ID },
    ...colleagues.map((c) => ({ name: c.name, id: c.id })),
  ];
}

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; name: string; id: number | typeof EVERYONE_MENTION_ID };

const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

// Leghosszabb-név-előbb egyeztetés, hogy pl. "Nagy Marci" ne csak
// "Nagy"-ként ismerődjön fel, ha véletlenül két kolléga neve egymás
// prefixuma. A "@" csak szó elején (mondatkezdet vagy szóköz után) indít
// tagelést, és a találat után sem állhat újabb szóalkotó karakter — ez
// zárja ki, hogy pl. "@Marcival" tévesen "@Marci"-ként highlightolódjon.
export function parseMentionSegments(body: string, candidates: MentionCandidate[]): MentionSegment[] {
  if (!body) return [];
  const sorted = [...candidates].sort((a, b) => b.name.length - a.name.length);
  const segments: MentionSegment[] = [];
  let textStart = 0;
  let i = 0;
  while (i < body.length) {
    if (body[i] === "@" && (i === 0 || /\s/.test(body[i - 1]))) {
      const rest = body.slice(i + 1);
      const match = sorted.find((c) => rest.toLowerCase().startsWith(c.name.toLowerCase()));
      if (match) {
        const afterIdx = i + 1 + match.name.length;
        const nextChar = body[afterIdx];
        const isWordChar = nextChar != null && WORD_CHAR_RE.test(nextChar);
        if (!isWordChar) {
          if (i > textStart) segments.push({ type: "text", value: body.slice(textStart, i) });
          segments.push({ type: "mention", name: match.name, id: match.id });
          i = afterIdx;
          textStart = i;
          continue;
        }
      }
    }
    i++;
  }
  if (textStart < body.length) segments.push({ type: "text", value: body.slice(textStart) });
  return segments;
}

export function messageMentionsUser(body: string, candidates: MentionCandidate[], userId: number): boolean {
  return parseMentionSegments(body, candidates).some(
    (seg) => seg.type === "mention" && (seg.id === EVERYONE_MENTION_ID || seg.id === userId)
  );
}
