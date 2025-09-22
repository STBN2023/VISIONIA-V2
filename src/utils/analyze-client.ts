import type { ProjectImage } from "@/utils/storage";
import type { RunMode } from "@/utils/runs";
import { getSettings } from "@/utils/settings";

export type AnalyzeOk =
  | { ok: true; mode: "aggregate"; outputText: string }
  | {
      ok: true;
      mode: "per_image";
      items: { imageId?: string; outputText: string }[];
    };

export type AnalyzeErr = { ok: false; error: string };

type OpenAIArgs = {
  apiKey: string;
  model: string;
  temperature: number;
  prompt: string;
  images: { dataUrl: string }[];
  max_tokens?: number;
};

async function callOpenAI({
  apiKey,
  model,
  temperature,
  prompt,
  images,
  max_tokens,
}: OpenAIArgs): Promise<string> {
  const content: any[] = [{ type: "text", text: prompt }];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: img.dataUrl },
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: max_tokens ?? 1200,
      messages: [{ role: "user", content }],
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg =
      (data && (data.error?.message || data.message)) ||
      `OpenAI error (status ${resp.status})`;
    throw new Error(msg);
  }
  const text =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.message?.parts?.map((p: any) => p?.text).join("\n") ??
    "";
  return String(text || "");
}

export async function analyzeLLM(input: {
  mode: RunMode;
  prompt: string;
  images: ProjectImage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}): Promise<AnalyzeOk | AnalyzeErr> {
  const s = getSettings();
  if (!s.apiKey || s.apiKey.trim().length < 10) {
    return {
      ok: false,
      error:
        "Aucune clé API détectée. Renseignez votre clé dans Paramètres pour lancer l’analyse.",
    };
  }

  const model = input.model || s.model || "gpt-4o-mini";
  const temperature =
    typeof input.temperature === "number" ? input.temperature : s.temperature ?? 0.2;
  const max_tokens =
    typeof input.max_tokens === "number" ? input.max_tokens : s.maxTokens ?? 1200;

  const limited = input.images.slice(0, 12);

  try {
    if (input.mode === "aggregate") {
      const text = await callOpenAI({
        apiKey: s.apiKey!,
        model,
        temperature,
        prompt: input.prompt,
        images: limited.map((i) => ({ dataUrl: i.dataUrl })),
        max_tokens,
      });
      return { ok: true, mode: "aggregate", outputText: text };
    } else {
      // per_image: un appel par image pour maîtriser la taille
      const items = await Promise.all(
        limited.map(async (img) => {
          const text = await callOpenAI({
            apiKey: s.apiKey!,
            model,
            temperature,
            prompt: input.prompt,
            images: [{ dataUrl: img.dataUrl }],
            max_tokens,
          });
          return { imageId: img.id, outputText: text };
        }),
      );
      return { ok: true, mode: "per_image", items };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "Erreur lors de l’appel OpenAI" };
  }
}