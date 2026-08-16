import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { ClientAiProfileRow } from "../db/clientAiProfiles.js";
import type { DraftType } from "../db/contentDrafts.js";

let client: Anthropic | undefined;

export function isAiScriptDraftEnabled(): boolean {
  return Boolean(config.anthropicApiKey);
}

function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY nincs beállítva a szerveren");
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const TYPE_INSTRUCTIONS: Record<DraftType, string> = {
  script:
    "Egy rövid videó forgatókönyvét (scriptjét) írd meg magyarul, olvasható, tagolt formában " +
    "(\"HOOK:\", \"1. JELENET:\", \"CTA:\" címkékkel).",
  caption:
    "Egy social media poszt szövegét (captionjét) írd meg magyarul, a végén releváns hashtagekkel és egy egyértelmű CTA-val.",
  image_concept:
    "Egy állóképes/kép-poszt vizuális koncepcióját írd le magyarul: mit ábrázoljon a kép (\"KÉP:\"), " +
    "milyen szöveg legyen rajta (\"KÉPEN LÉVŐ SZÖVEG:\"), és 2-3 stílusreferenciát (\"REFERENCIÁK:\").",
  carousel:
    "Egy közösségi média karusszel-posztot tervezz meg magyarul, diánként (\"1. DIA:\", \"2. DIA:\" stb.), " +
    "soronként a dia szövegével és egy rövid vizuális jegyzettel.",
};

function buildSystemPrompt(
  clientName: string,
  platform: string,
  type: DraftType,
  profile: ClientAiProfileRow | undefined
): string {
  const lines = [`Te a(z) "${clientName}" social media tartalomkészítője vagy. A platform: ${platform}.`];
  if (profile?.brand_voice) lines.push(`Hangvétel: ${profile.brand_voice}`);
  if (profile?.target_audience) lines.push(`Célközönség: ${profile.target_audience}`);
  if (profile?.visual_direction) lines.push(`Vizuális irány: ${profile.visual_direction}`);
  if (profile?.cta_style) lines.push(`CTA stílus: ${profile.cta_style}`);
  if (profile?.platform_notes) lines.push(`Platform-specifikus jegyzetek: ${profile.platform_notes}`);
  if (profile?.forbidden_topics) lines.push(`Kerülendő témák/szavak:\n${profile.forbidden_topics}`);
  if (profile?.reference_links) lines.push(`Korábbi jól teljesítő tartalmak (stílus-referenciaként):\n${profile.reference_links}`);
  lines.push(
    `${TYPE_INSTRUCTIONS[type]} Ne írj bevezetőt vagy magyarázatot a tartalom előtt/után, csak magát a tartalmat add vissza.`
  );
  return lines.join("\n");
}

export interface GenerateContentDraftInput {
  clientName: string;
  platform: string;
  type: DraftType;
  topic: string;
  profile: ClientAiProfileRow | undefined;
}

export async function generateContentDraft(input: GenerateContentDraftInput): Promise<string> {
  const ai = getClient();
  const message = await ai.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1536,
    system: buildSystemPrompt(input.clientName, input.platform, input.type, input.profile),
    messages: [{ role: "user", content: `Téma/cél: ${input.topic}` }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("Az AI nem adott vissza szöveges választ");
  }
  return textBlock.text;
}

// Visszamenőleg kompatibilis wrapper a meglévő Social Media "Scriptre vár"
// szakasz AI-gombjához (routes/contentItems.ts "generate-script" végpontja)
// — ugyanaz, csak type: "script" fixen, hogy az a hívó ne kelljen módosuljon.
export interface GenerateScriptDraftInput {
  clientName: string;
  platform: string;
  topic: string;
  profile: ClientAiProfileRow | undefined;
}

export async function generateScriptDraft(input: GenerateScriptDraftInput): Promise<string> {
  return generateContentDraft({ ...input, type: "script" });
}
