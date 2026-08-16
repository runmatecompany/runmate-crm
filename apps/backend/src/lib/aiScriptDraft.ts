import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { ClientAiProfileRow } from "../db/clientAiProfiles.js";

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

function buildSystemPrompt(clientName: string, platform: string, profile: ClientAiProfileRow | undefined): string {
  const lines = [`Te a(z) "${clientName}" social media tartalomkészítője vagy. A platform: ${platform}.`];
  if (profile?.brand_voice) lines.push(`Hangvétel: ${profile.brand_voice}`);
  if (profile?.target_audience) lines.push(`Célközönség: ${profile.target_audience}`);
  if (profile?.visual_direction) lines.push(`Vizuális irány: ${profile.visual_direction}`);
  if (profile?.cta_style) lines.push(`CTA stílus: ${profile.cta_style}`);
  if (profile?.platform_notes) lines.push(`Platform-specifikus jegyzetek: ${profile.platform_notes}`);
  if (profile?.forbidden_topics) lines.push(`Kerülendő témák/szavak:\n${profile.forbidden_topics}`);
  if (profile?.reference_links) lines.push(`Korábbi jól teljesítő tartalmak (stílus-referenciaként):\n${profile.reference_links}`);
  lines.push(
    "Egy rövid videó forgatókönyvét (scriptjét) írd meg magyarul, olvasható, tagolt formában " +
      "(pl. \"HOOK:\", \"1. JELENET:\", \"CTA:\" címkékkel). Ne írj bevezetőt vagy magyarázatot a script előtt/után, " +
      "csak magát a scriptet add vissza."
  );
  return lines.join("\n");
}

export interface GenerateScriptDraftInput {
  clientName: string;
  platform: string;
  topic: string;
  profile: ClientAiProfileRow | undefined;
}

export async function generateScriptDraft(input: GenerateScriptDraftInput): Promise<string> {
  const ai = getClient();
  const message = await ai.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystemPrompt(input.clientName, input.platform, input.profile),
    messages: [{ role: "user", content: `Téma/cél: ${input.topic}` }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("Az AI nem adott vissza szöveges választ");
  }
  return textBlock.text;
}
