import type { ProjectImage } from "@/utils/storage";
import type { RunMode } from "@/utils/runs";

export type AnalyzeOk =
  | { ok: true; mode: "aggregate"; outputText: string }
  | {
      ok: true;
      mode: "per_image";
      items: { imageId?: string; outputText: string }[];
    };

export type AnalyzeErr = { ok: false; error: string };

export async function analyzeLLM(input: {
  mode: RunMode;
  prompt: string;
  images: ProjectImage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}): Promise<AnalyzeOk | AnalyzeErr> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: input.mode,
      prompt: input.prompt,
      model: input.model,
      temperature: input.temperature,
      max_tokens: input.max_tokens ?? 1200,
      images: input.images.map((img) => ({
        id: img.id,
        dataUrl: img.dataUrl,
        name: img.name,
        tag: img.tag,
      })),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      error:
        data?.error ||
        `Erreur API (status ${res.status}) lors de l'analyse LLM`,
    };
  }
  return data as AnalyzeOk;
}