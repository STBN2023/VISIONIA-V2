import type { ProjectImage } from "@/utils/storage";
import type { RunMode } from "@/utils/runs";
import type { Box } from "@/utils/runs";
import { getSettings } from "@/utils/settings";
import { colorFor, guessType } from "@/utils/anomaly-colors";

export type AnalyzeOk =
  | { ok: true; mode: "aggregate"; outputText: string }
  | {
      ok: true;
      mode: "per_image";
      items: { imageId?: string; outputText: string; boxes?: Box[] }[];
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

// ---- Helpers pour extraction JSON et normalisation des boxes ----

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function extractFirstJsonObject(text: string): any | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          // continue
        }
      }
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toTitle(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function toBoxes(obj: any): { boxes: Box[]; summary?: string } {
  const boxes: Box[] = [];
  const anomalies = Array.isArray(obj?.anomalies) ? obj.anomalies : [];
  for (const a of anomalies) {
    const b = a?.box || {};
    const x = clamp01(Number(b?.x ?? 0));
    const y = clamp01(Number(b?.y ?? 0));
    const w = clamp01(Number(b?.w ?? 0));
    const h = clamp01(Number(b?.h ?? 0));
    const lbl = typeof a?.label === "string" ? a.label : undefined;
    const typeRaw = typeof a?.type === "string" ? a.type : undefined;
    const inferredType = (typeRaw as string) || guessType(lbl);
    const col = colorFor({ type: inferredType, label: lbl, color: a?.color });

    if (w > 0 && h > 0) {
      boxes.push({
        id: crypto.randomUUID(),
        x,
        y,
        w,
        h,
        color: col,
        label: lbl || toTitle(String(inferredType || "anomalie")),
      });
    }
  }
  const summary = typeof obj?.summary === "string" ? obj.summary : undefined;
  return { boxes, summary };
}

function buildDetectionInstruction(userPrompt: string): string {
  // Instruction claire pour JSON strict avec type normalisé
  return [
    "Analyse cette image pour détecter des anomalies visibles (fissures, infiltrations, humidité, isolation, ponts thermiques, menuiseries, toiture, etc.).",
    "Réponds UNIQUEMENT en JSON (pas de texte autour, pas de markdown) au format strict suivant:",
    "{",
    '  "anomalies": [',
    '    {',
    '      "type": "fissure|infiltration|humidite|isolation|pont_thermique|menuiserie|toiture|moisissure|structure|electrique|plomberie|vegetation|autre",',
    '      "label": "Courte description lisible (FR)",',
    '      "box": { "x": 0.12, "y": 0.34, "w": 0.22, "h": 0.15 }',
    "    }",
    "  ],",
    '  "summary": "Résumé technique concis des constats et recommandations (FR)"',
    "}",
    "- Contraintes:",
    "  - Les coordonnées x,y,w,h sont normalisées entre 0 et 1 (0 = bord gauche/haut, 1 = bord droit/bas).",
    "  - Si aucune anomalie, renvoie anomalies: [].",
    "  - Utilise le champ 'type' avec les valeurs proposées pour homogénéiser.",
    "Contexte (prompt utilisateur):",
    userPrompt || "(aucun)",
  ].join("\n");
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
      const instruction = buildDetectionInstruction(input.prompt);
      const items = await Promise.all(
        limited.map(async (img) => {
          const raw = await callOpenAI({
            apiKey: s.apiKey!,
            model,
            temperature,
            prompt: instruction,
            images: [{ dataUrl: img.dataUrl }],
            max_tokens,
          });

          const parsed = extractFirstJsonObject(raw);
          if (parsed) {
            const { boxes, summary } = toBoxes(parsed);
            return {
              imageId: img.id,
              outputText: (summary && String(summary)) || raw,
              boxes,
            };
          } else {
            return {
              imageId: img.id,
              outputText: raw,
              boxes: [],
            };
          }
        }),
      );
      return { ok: true, mode: "per_image", items };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "Erreur lors de l’appel OpenAI" };
  }
}