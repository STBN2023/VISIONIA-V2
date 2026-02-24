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

  // Determine if we should force JSON mode
  const isJsonPrompt = prompt.toLowerCase().includes("json") || prompt.includes("{");

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
      // Force JSON mode if requested in prompt
      response_format: isJsonPrompt ? { type: "json_object" } : undefined,
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

function parseNumAny(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, ".").replace(/\s+/g, "");
    const pct = s.endsWith("%");
    const raw = pct ? s.slice(0, -1) : s;
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) return NaN;
    if (pct) return num / 100;
    return num;
  }
  return NaN;
}

type ParsedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color?: string;
  type?: string;
  confidence?: number;
  angle?: number; // degrés
};

function canonRect(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  const vals = [x, y, w, h].map((v) => (v > 1.5 && v <= 100 ? v / 100 : v));
  let [nx, ny, nw, nh] = vals;
  if (nw > 1 && nh > 1) {
    nw = (nw > 1.5 && nw <= 100 ? nw / 100 : nw) - (nx > 1.5 && nx <= 100 ? nx / 100 : nx);
    nh = (nh > 1.5 && nh <= 100 ? nh / 100 : nh) - (ny > 1.5 && ny <= 100 ? ny / 100 : ny);
  }
  if (nw < 0) {
    nx = nx + nw;
    nw = Math.abs(nw);
  }
  if (nh < 0) {
    ny = ny + nh;
    nh = Math.abs(nh);
  }
  nx = clamp01(nx);
  ny = clamp01(ny);
  nw = clamp01(nw);
  nh = clamp01(nh);
  if (nw <= 0 || nh <= 0) return null;
  return { x: nx, y: ny, w: nw, h: nh };
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

// Détecte les réponses de refus typiques pour éviter de les afficher en sortie utilisateur
function isLikelyRefusal(text: string): boolean {
  const s = String(text || "").toLowerCase();
  return (
    /\bi (can('|’)?t|cannot)\s+(assist|help)/.test(s) ||
    s.includes("i'm sorry") ||
    s.includes("i am sorry") ||
    s.includes("as an ai") ||
    s.includes("je ne peux pas") ||
    s.includes("désolé") ||
    s.includes("je ne suis pas en mesure") ||
    s.includes("je ne suis pas autorisé")
  );
}

function toTitle(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function parseAngleAny(a: any): number | undefined {
  const raw = a?.angle ?? a?.rotation ?? a?.theta;
  if (raw === undefined || raw === null) return undefined;
  let val = parseNumAny(raw);
  if (!Number.isFinite(val)) return undefined;
  // Si ça ressemble à des radians (petite valeur), convertir en degrés
  if (Math.abs(val) <= Math.PI + 0.01) {
    // heuristique: theta en radians
    val = (val * 180) / Math.PI;
  }
  // Clamp raisonnable
  if (val < -180) val = ((val + 180) % 360) - 180;
  if (val > 180) val = ((val - 180) % 360) - 180;
  return val;
}

function parseAnomalyToParsedBox(a: any): ParsedBox | null {
  const bb = a?.box ?? a?.bbox ?? a?.boundingBox ?? a?.region ?? a;
  if (!bb || typeof bb !== "object") return null;

  // 1) x/y/w/h directs
  let x = parseNumAny(bb.x);
  let y = parseNumAny(bb.y);
  let w = parseNumAny(bb.w);
  let h = parseNumAny(bb.h);

  // 2) alias left/top/width/height
  if (![x, y, w, h].every((n) => Number.isFinite(n))) {
    x = Number.isFinite(x) ? x : parseNumAny(bb.left);
    y = Number.isFinite(y) ? y : parseNumAny(bb.top);
    w = Number.isFinite(w) ? w : parseNumAny(bb.width);
    h = Number.isFinite(h) ? h : parseNumAny(bb.height);
  }

  // 3) coordonnées x1/y1/x2/y2
  if (![x, y, w, h].every((n) => Number.isFinite(n))) {
    const x1 = parseNumAny(bb.x1 ?? bb.left ?? bb.minX);
    const y1 = parseNumAny(bb.y1 ?? bb.top ?? bb.minY);
    const x2 = parseNumAny(bb.x2 ?? bb.right ?? bb.maxX);
    const y2 = parseNumAny(bb.y2 ?? bb.bottom ?? bb.maxY);
    if ([x1, y1, x2, y2].every((n) => Number.isFinite(n))) {
      const rect = canonRect(x1, y1, (x2 as number), (y2 as number));
      if (rect) {
        x = rect.x;
        y = rect.y;
        w = rect.w;
        h = rect.h;
      }
    }
  }

  // 4) tableau [x,y,w,h]
  if (![x, y, w, h].every((n) => Number.isFinite(n)) && Array.isArray(bb) && bb.length >= 4) {
    const rect = canonRect(parseNumAny(bb[0]), parseNumAny(bb[1]), parseNumAny(bb[2]), parseNumAny(bb[3]));
    if (rect) {
      x = rect.x;
      y = rect.y;
      w = rect.w;
      h = rect.h;
    }
  }

  const canon = canonRect(x, y, w, h);
  if (!canon) return null;

  const lbl = typeof a?.label === "string" ? a.label : undefined;
  const typeRaw = typeof a?.type === "string" ? a.type : undefined;
  const conf = Number.isFinite(a?.confidence) ? Number(a.confidence) : undefined;
  const inferredType = (typeRaw as string) || guessType(lbl);
  const col = colorFor({ type: inferredType, label: lbl, color: a?.color });
  const angle = parseAngleAny(a);

  return {
    x: canon.x,
    y: canon.y,
    w: canon.w,
    h: canon.h,
    label: lbl || toTitle(String(inferredType || "anomalie")),
    color: col,
    type: inferredType,
    confidence: conf,
    angle,
  };
}

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
    minSide = 0.02,
    minArea = 0.005,
    maxArea = 0.75,
    minConfidence = 0.45,
    maxCount = 10,
    iouThreshold = 0.5,
  } = {},
): ParsedBox[] {
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

  filtered = filtered.filter((b) => {
    const area = b.w * b.h;
    const okSide = b.w >= minSide && b.h >= minSide;
    const okArea = area >= minArea && area <= maxArea;
    return okSide && okArea;
  });

  filtered = filtered.filter((b) => (b.confidence === undefined ? true : b.confidence >= minConfidence));

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

  if (deduped.length > maxCount) {
    deduped.sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5));
    return deduped.slice(0, maxCount);
  }

  return deduped;
}

function toBoxes(obj: any): { boxes: Box[]; summary?: string } {
  const anomalies = Array.isArray(obj?.anomalies) ? obj.anomalies : [];
  const parsedRaw: ParsedBox[] = [];
  for (const a of anomalies) {
    const pb = parseAnomalyToParsedBox(a);
    if (pb) parsedRaw.push(pb);
  }

  let refined = postProcessBoxes(parsedRaw);

  if (refined.length === 0 && parsedRaw.length > 0) {
    refined = postProcessBoxes(parsedRaw, {
      minSide: 0.015,
      minArea: 0.003,
      maxArea: 0.85,
      minConfidence: 0.2,
      maxCount: 12,
      iouThreshold: 0.55,
    });
  }

  const boxes: Box[] = refined.map((b) => ({
    id: crypto.randomUUID(),
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    color: b.color || "#22C55E",
    label: b.label,
    angle: b.angle,
  }));

  const summary = typeof obj?.summary === "string" ? obj.summary : undefined;
  return { boxes, summary };
}

function buildCombinedInstruction(userPrompt: string): string {
  const example = [
    "{",
    '  "anomalies": [',
    "    {",
    '      "type": "fissure",',
    '      "label": "Fissure verticale en rive de baie",',
    '      "confidence": 0.82,',
    '      "angle": -12,',
    '      "box": { "x": 0.12, "y": 0.34, "w": 0.22, "h": 0.15 }',
    "    }",
    "  ],",
    '  "analysis": "Analyse technique détaillée de l\'image (FR)"',
    "}",
  ].join("\n");

  return [
    "Tu es un expert en pathologies du bâtiment. Analyse cette image et produis un JSON avec :",
    "1. Les anomalies VISIBLES avec leurs bounding boxes normalisées (0..1)",
    "2. Une analyse technique détaillée dans le champ 'analysis'",
    "",
    "Types d'anomalies: fissure, infiltration, humidite, isolation, pont_thermique, menuiserie, toiture, moisissure, structure, electrique, plomberie, vegetation, autre.",
    "Réponds STRICTEMENT en JSON valide (aucun texte avant/après, pas de markdown).",
    "Coordonnées normalisées 0..1 (x,y,w,h). Optionnel: angle en degrés.",
    "Contraintes: anomalies: [] si aucune certaine; boîtes serrées; max 6 anomalies pertinentes.",
    "Exemple:",
    example,
    "",
    "Contexte utilisateur:",
    userPrompt || "(aucun)",
  ].join("\n");
}

export type ProgressCallback = (current: number, total: number, phase: string) => void;

export async function analyzeLLM(input: {
  mode: RunMode;
  prompt: string;
  images: ProjectImage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  onProgress?: ProgressCallback;
}): Promise<AnalyzeOk | AnalyzeErr> {
  const s = getSettings();
  if (!s.apiKey || s.apiKey.trim().length < 10) {
    return {
      ok: false,
      error:
        "Aucune clé API détectée. Renseignez votre clé dans Paramètres pour lancer l'analyse.",
    };
  }

  const model = input.model || s.model || "gpt-4o";
  const userTemp = typeof input.temperature === "number" ? input.temperature : s.temperature ?? 0.2;
  const max_tokens = 4000;

  try {
    if (input.mode === "aggregate") {
      // Phase 1: Rapport agrégé global (1 appel avec toutes les images)
      input.onProgress?.(0, input.images.length + 1, "Génération du rapport global...");
      const aggregateText = await callOpenAI({
        apiKey: s.apiKey!,
        model,
        temperature: userTemp,
        prompt: input.prompt,
        images: input.images.map((i) => ({ dataUrl: i.dataUrl })),
        max_tokens,
      });

      // Phase 2: Détection + analyse combinées par image (1 seul appel par image au lieu de 2)
      const combinedInstruction = buildCombinedInstruction(input.prompt);

      const items: { imageId: string; outputText: string; boxes: Box[] }[] = [];
      for (let i = 0; i < input.images.length; i++) {
        const img = input.images[i];
        input.onProgress?.(i + 1, input.images.length + 1, `Analyse image ${i + 1}/${input.images.length}...`);

        const raw = await callOpenAI({
          apiKey: s.apiKey!,
          model,
          temperature: 0.2,
          prompt: combinedInstruction,
          images: [{ dataUrl: img.dataUrl }],
          max_tokens,
        });

        const parsed = extractFirstJsonObject(raw);
        if (parsed) {
          const { boxes } = toBoxes(parsed);
          const analysisText = typeof parsed.analysis === "string" ? parsed.analysis : "";
          const finalText = isLikelyRefusal(analysisText) ? "" : analysisText;
          items.push({ imageId: img.id, outputText: finalText, boxes });
        } else {
          items.push({ imageId: img.id, outputText: isLikelyRefusal(raw) ? "" : raw, boxes: [] });
        }
      }

      return { ok: true, mode: "aggregate", outputText: aggregateText, items };
    } else {
      // Mode per_image: 1 appel combiné par image
      const combinedInstruction = buildCombinedInstruction(input.prompt);

      const items: { imageId: string; outputText: string; boxes: Box[] }[] = [];
      for (let i = 0; i < input.images.length; i++) {
        const img = input.images[i];
        input.onProgress?.(i + 1, input.images.length, `Analyse image ${i + 1}/${input.images.length}...`);

        const raw = await callOpenAI({
          apiKey: s.apiKey!,
          model,
          temperature: 0.2,
          prompt: combinedInstruction,
          images: [{ dataUrl: img.dataUrl }],
          max_tokens,
        });

        const parsed = extractFirstJsonObject(raw);
        if (parsed) {
          const { boxes, summary } = toBoxes(parsed);
          const analysisText = typeof parsed.analysis === "string" ? parsed.analysis : "";
          const finalText = analysisText || (summary && String(summary)) || (isLikelyRefusal(raw) ? "" : raw);
          items.push({ imageId: img.id, outputText: finalText, boxes });
        } else {
          items.push({ imageId: img.id, outputText: isLikelyRefusal(raw) ? "" : raw, boxes: [] });
        }
      }

      return { ok: true, mode: "per_image", items };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "Erreur lors de l'appel OpenAI" };
  }
}