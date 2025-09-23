import type { ProjectImage } from "@/utils/storage";
import type { RunMode } from "@/utils/runs";
import type { Box } from "@/utils/runs";
import { getSettings } from "@/utils/settings";
import { colorFor, guessType } from "@/utils/anomaly-colors";

export type AnalyzeOk =
  | {
      ok: true;
      mode: "aggregate";
      outputText: string;
      items?: { imageId?: string; outputText: string; boxes?: Box[] }[];
    }
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

/* ---------- Helpers extraction/normalisation ---------- */

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
          // continue scanning
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

type ParsedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color?: string;
  type?: string;
  confidence?: number; // 0..1
};

function iou(a: ParsedBox, b: ParsedBox): number {
  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = Math.max(0, a.w) * Math.max(0, a.h);
  const areaB = Math.max(0, b.w) * Math.max(0, b.h);
  const union = areaA + areaB - inter;
  if (union <= 0) return 0;
  return inter / union;
}

function postProcessBoxes(
  boxes: ParsedBox[],
  {
    minSide = 0.04,
    minArea = 0.02,
    maxArea = 0.5,
    minConfidence = 0.6,
    maxCount = 6,
    iouThreshold = 0.6,
  } = {},
): ParsedBox[] {
  // Clamp + filtre de base
  let filtered = boxes
    .map((b) => ({
      ...b,
      x: clamp01(b.x),
      y: clamp01(b.y),
      w: clamp01(b.w),
      h: clamp01(b.h),
      confidence: typeof b.confidence === "number" ? Math.max(0, Math.min(1, b.confidence)) : undefined,
    }))
    .filter((b) => b.w > 0 && b.h > 0);

  // Filtres taille/aire
  filtered = filtered.filter((b) => {
    const area = b.w * b.h;
    const okSide = b.w >= minSide && b.h >= minSide;
    const okArea = area >= minArea && area <= maxArea;
    return okSide && okArea;
  });

  // Seuil de confiance (si présent)
  filtered = filtered.filter((b) => (b.confidence === undefined ? true : b.confidence >= minConfidence));

  // Déduplication par IoU
  const deduped: ParsedBox[] = [];
  for (const b of filtered) {
    let keep = true;
    for (let i = 0; i < deduped.length; i++) {
      const d = deduped[i];
      if (iou(b, d) >= iouThreshold) {
        const bc = b.confidence ?? 0.5;
        const dc = d.confidence ?? 0.5;
        if (bc > dc) deduped[i] = b;
        keep = false;
        break;
      }
    }
    if (keep) deduped.push(b);
  }

  // Limite max
  if (deduped.length > maxCount) {
    deduped.sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5));
    deduped = deduped.slice(0, maxCount);
  }

  return deduped;
}

function toBoxes(obj: any): { boxes: Box[]; summary?: string } {
  const parsed: ParsedBox[] = [];
  const anomalies = Array.isArray(obj?.anomalies) ? obj.anomalies : [];
  for (const a of anomalies) {
    const bb = a?.box || {};
    const x = clamp01(Number(bb?.x ?? 0));
    const y = clamp01(Number(bb?.y ?? 0));
    const w = clamp01(Number(bb?.w ?? 0));
    const h = clamp01(Number(bb?.h ?? 0));
    const lbl = typeof a?.label === "string" ? a.label : undefined;
    const typeRaw = typeof a?.type === "string" ? a.type : undefined;
    const conf = Number.isFinite(a?.confidence) ? Number(a.confidence) : undefined;

    const inferredType = (typeRaw as string) || guessType(lbl);
    const col = colorFor({ type: inferredType, label: lbl, color: a?.color });

    parsed.push({
      x,
      y,
      w,
      h,
      label: lbl || toTitle(String(inferredType || "anomalie")),
      color: col,
      type: inferredType,
      confidence: conf,
    });
  }

  const refined = postProcessBoxes(parsed);

  const boxes: Box[] = refined.map((b) => ({
    id: crypto.randomUUID(),
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    color: b.color || "#22C55E",
    label: b.label,
  }));

  const summary = typeof obj?.summary === "string" ? obj.summary : undefined;
  return { boxes, summary };
}

function buildDetectionInstruction(userPrompt: string): string {
  return [
    "Détecte UNIQUEMENT les anomalies VISIBLES sur l’image (fissure, infiltration, humidité, isolation, pont_thermique, menuiserie, toiture, moisissure, structure, electrique, plomberie, vegetation, autre).",
    "RÉPONDS STRICTEMENT en JSON (aucun texte avant/après, pas de markdown):",
    "{",
    '  "anomalies": [',
    "    {",
    '      "type": "fissure|infiltration|humidite|isolation|pont_thermique|menuiserie|toiture|moisissure|structure|electrique|plomberie|vegetation|autre",',
    '      "label": "Courte description FR lisible",',
    '      "confidence": 0.0_to_1.0,',
    '      "box": { "x": 0.12, "y": 0.34, "w": 0.22, "h": 0.15 }',
    "    }",
    "  ],",
    '  "summary": "Résumé technique concis (FR)"',
    "}",
    "- Contraintes:",
    "  - JSON valide obligatoire; si aucune anomalie certaine, renvoyer anomalies: [].",
    "  - Privilégier la PRÉCISION (pas de faux positifs).",
    "  - Les coordonnées sont normalisées 0..1; boîte serrée autour de la zone visible.",
    "  - Éviter les boîtes minuscules/gigantesques; pas de boîte englobant toute l’image sans raison.",
    "  - Limite: max 6 anomalies pertinentes.",
    `Contexte utilisateur:\n${userPrompt || "(aucun)"}`,
  ].join("\n");
}

/* ---------- Entrée principale ---------- */

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
  const userTemp = typeof input.temperature === "number" ? input.temperature : s.temperature ?? 0.2;
  const max_tokens =
    typeof input.max_tokens === "number" ? input.max_tokens : s.maxTokens ?? 1200;

  try {
    if (input.mode === "aggregate") {
      // 1) Texte global
      const aggregateText = await callOpenAI({
        apiKey: s.apiKey!,
        model,
        temperature: userTemp,
        prompt: input.prompt,
        images: input.images.map((i) => ({ dataUrl: i.dataUrl })),
        max_tokens,
      });

      // 2) Par image: annotations (température faible) + texte prompt classique
      const detectionInstruction = buildDetectionInstruction(input.prompt);
      const detectionTemp = 0.1;

      const items = await Promise.all(
        input.images.map(async (img) => {
          // Détection/annotations
          const detectionRaw = await callOpenAI({
            apiKey: s.apiKey!,
            model,
            temperature: detectionTemp,
            prompt: detectionInstruction,
            images: [{ dataUrl: img.dataUrl }],
            max_tokens,
          });
          const parsed = extractFirstJsonObject(detectionRaw);
          const { boxes, summary } = parsed ? toBoxes(parsed) : { boxes: [], summary: undefined };

          // Texte par image avec le prompt utilisateur
          const perImageText = await callOpenAI({
            apiKey: s.apiKey!,
            model,
            temperature: userTemp,
            prompt: input.prompt,
            images: [{ dataUrl: img.dataUrl }],
            max_tokens,
          });

          return {
            imageId: img.id,
            outputText: (perImageText && String(perImageText)) || (summary && String(summary)) || "",
            boxes,
          };
        }),
      );

      return { ok: true, mode: "aggregate", outputText: aggregateText, items };
    } else {
      // Mode par image: détection stricte + résumé
      const instruction = buildDetectionInstruction(input.prompt);
      const detectionTemp = 0.1;
      const items = await Promise.all(
        input.images.map(async (img) => {
          const raw = await callOpenAI({
            apiKey: s.apiKey!,
            model,
            temperature: detectionTemp,
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