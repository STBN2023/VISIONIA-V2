import * as ort from "onnxruntime-web";
import { getSettings, saveSettings } from "@/utils/settings";
import { getDatasetManifest } from "@/utils/dataset";
import { idbGet } from "@/utils/idb";

// Stockage modèle dans IDB (défini dans dataset.ts)
const MODEL_PREFIX = "dataset:model:";

type Backend = "webgpu" | "webgl" | "wasm";

type ClassifyResult = {
  probs: number[];
  topIndex: number;
  topScore: number;
  topLabel: string;
};

let cachedSession: ort.InferenceSession | null = null;
let cachedKey = "";

// Utilitaires base64 <-> bytes
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const [, b64] = dataUrl.split(",");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function softmax(logits: Float32Array | number[]): number[] {
  const max = Math.max(...Array.from(logits as any));
  const exps = Array.from(logits as any).map((v: number) => Math.exp(v - max));
  const sum = exps.reduce((a: number, b: number) => a + b, 0);
  return exps.map((v: number) => v / (sum || 1));
}

function getBackendPref(): Backend[] {
  const pref = getSettings().inference?.backendPreference || "webgpu";
  const order: Backend[] =
    pref === "webgpu" ? ["webgpu", "webgl", "wasm"] :
    pref === "webgl" ? ["webgl", "wasm"] : ["wasm"];
  return order;
}

async function loadModelBytesFromSettings(): Promise<Uint8Array> {
  const s = getSettings();
  const ref = s.modelRef;
  if (!ref) throw new Error("Aucun modèle configuré. Importez un fichier .onnx dans Paramètres.");
  if (ref.source === "idb") {
    const dataUrl = await idbGet(MODEL_PREFIX + ref.value);
    if (!dataUrl) throw new Error("Modèle introuvable en local (IDB). Réimportez le .onnx.");
    return dataUrlToUint8Array(dataUrl);
  }
  // URL distante
  const resp = await fetch(ref.value);
  if (!resp.ok) throw new Error("Échec du chargement du modèle via URL.");
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

export async function getOrCreateSession(): Promise<ort.InferenceSession> {
  const s = getSettings();
  const ref = s.modelRef;
  if (!ref) throw new Error("Aucun modèle configuré.");
  const epOrder = getBackendPref();
  const key = `${ref.source}:${ref.value}:${epOrder.join(",")}`;
  if (cachedSession && cachedKey === key) return cachedSession;

  const bytes = await loadModelBytesFromSettings();

  // Essayer les EP dans l'ordre de préférence
  let lastErr: unknown = null;
  for (const ep of epOrder) {
    try {
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [ep],
        graphOptimizationLevel: "all",
      } as any);
      cachedSession = session;
      cachedKey = key;
      return session;
    } catch (e) {
      lastErr = e;
      // continue with next EP
    }
  }
  throw new Error("Impossible d'initialiser la session ONNX (" + String(lastErr) + ")");
}

function centerCropSquare(img: HTMLImageElement): { sx: number; sy: number; s: number } {
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = Math.floor((img.naturalWidth - s) / 2);
  const sy = Math.floor((img.naturalHeight - s) / 2);
  return { sx, sy, s };
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Échec chargement image"));
    img.src = dataUrl;
  });
}

async function preprocessToTensor(
  dataUrl: string,
  size: number,
  normalization?: { scale?: number; mean?: number[]; std?: number[] },
): Promise<ort.Tensor> {
  const img = await loadImage(dataUrl);
  const { sx, sy, s } = centerCropSquare(img);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context non disponible.");
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const scale = normalization?.scale ?? 1;
  const mean = normalization?.mean ?? [0, 0, 0];
  const std = normalization?.std ?? [1, 1, 1];

  const float = new Float32Array(3 * size * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const r = data[idx] / 255 / scale;
      const g = data[idx + 1] / 255 / scale;
      const b = data[idx + 2] / 255 / scale;
      // NCHW
      float[p] = (r - mean[0]) / std[0]; // R
      float[p + size * size] = (g - mean[1]) / std[1]; // G
      float[p + 2 * size * size] = (b - mean[2]) / std[2]; // B
      p++;
    }
  }
  return new ort.Tensor("float32", float, [1, 3, size, size]);
}

export async function classifyDataUrl(dataUrl: string): Promise<ClassifyResult> {
  const s = getSettings();
  const session = await getOrCreateSession();
  const inputSize = s.modelMeta?.inputSize || 224;
  const tensor = await preprocessToTensor(dataUrl, inputSize, s.modelMeta?.normalization);

  // Déduire les noms d'IO
  const inputName = (session.inputNames && session.inputNames[0]) || "images";
  const outputName = (session.outputNames && session.outputNames[0]) || "output";

  const outputs = await session.run({ [inputName]: tensor });
  const out = outputs[outputName];
  if (!out) throw new Error("Sortie du modèle introuvable.");
  const logits = out.data as Float32Array;
  const probs = softmax(logits);
  const topIndex = probs.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0);
  const topScore = probs[topIndex] || 0;
  const topLabel = s.modelMeta?.classesOrder?.[topIndex] || String(topIndex);
  return { probs, topIndex, topScore, topLabel };
}

function pickGrid(min = 0.5, max = 0.8, step = 0.02): number[] {
  const arr: number[] = [];
  for (let t = min; t <= max + 1e-6; t += step) arr.push(Number(t.toFixed(2)));
  return arr;
}

type BinEval = {
  t: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  f1: number;
  precision: number;
  recall: number;
};

function evalBinary(records: { isPlainGT: boolean; topIsPlain: boolean; score: number }[], t: number): BinEval {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of records) {
    const predDefect = !r.topIsPlain && r.score >= t;
    const gtDefect = !r.isPlainGT;
    if (predDefect && gtDefect) tp++;
    else if (predDefect && !gtDefect) fp++;
    else if (!predDefect && !gtDefect) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { t, tp, fp, tn, fn, f1, precision, recall };
}

function samplePerClass<T extends { className: string }>(items: T[], k: number): T[] {
  const byClass = new Map<string, T[]>();
  items.forEach((it) => {
    const arr = byClass.get(it.className) || [];
    arr.push(it);
    byClass.set(it.className, arr);
  });
  const out: T[] = [];
  for (const arr of byClass.values()) {
    // shuffle simple
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    out.push(...arr.slice(0, Math.min(k, arr.length)));
  }
  return out;
}

// Calibre un seuil sur "val" (binaire: défaut vs plain) et sauvegarde les settings
export async function calibrateOnVal(samplePerClassCount = 10): Promise<{
  threshold: number;
  report: string;
  evalAtBest: BinEval;
}> {
  const s = getSettings();
  if (!s.datasetRef?.datasetId) throw new Error("Aucun dataset courant.");
  if (!s.modelMeta?.classesOrder?.length) throw new Error("Définissez l’ordre des classes du modèle.");
  const plainIdx = s.modelMeta.classesOrder.indexOf("plain");
  if (plainIdx < 0) throw new Error('La classe "plain" doit exister dans classesOrder.');

  const manifest = await getDatasetManifest(s.datasetRef.datasetId);
  if (!manifest) throw new Error("Manifest du dataset introuvable.");
  const val = manifest.splits.val;
  if (!val?.length) throw new Error("Le split val est vide.");

  const sample = samplePerClass(val, samplePerClassCount);
  const records: { isPlainGT: boolean; topIsPlain: boolean; score: number }[] = [];
  for (const e of sample) {
    const dataUrl = await idbGet(e.blobKey);
    if (!dataUrl) continue;
    const { topIndex, topScore } = await classifyDataUrl(dataUrl);
    records.push({
      isPlainGT: e.className === "plain",
      topIsPlain: topIndex === plainIdx,
      score: topScore,
    });
  }

  const grid = pickGrid(0.5, 0.8, 0.02);
  let best = { t: 0.6, f1: -1, tp: 0, fp: 0, tn: 0, fn: 0, precision: 0, recall: 0 };
  for (const t of grid) {
    const ev = evalBinary(records, t);
    // stratégie: maximiser F1, et en cas d'égalité minimiser FP
    if (ev.f1 > best.f1 || (Math.abs(ev.f1 - best.f1) < 1e-6 && ev.fp < best.fp)) {
      best = ev;
    }
  }

  // Enregistrer
  saveSettings({
    inference: {
      ...(s.inference || { batchSize: 1, warmup: false }),
      threshold: best.t,
    },
    calibrationReport: {
      date: new Date().toISOString(),
      sampleSize: records.length,
      criterion: "F1 binaire (défaut vs plain), tie-break FP minimal",
      thresholdRecommended: best.t,
      metricsSummary: `F1=${best.f1.toFixed(3)}; P=${best.precision.toFixed(3)}; R=${best.recall.toFixed(3)}; TP=${best.tp} FP=${best.fp} TN=${best.tn} FN=${best.fn}`,
    },
  });

  const report =
    `Seuil recommandé: ${best.t.toFixed(2)}\n` +
    `F1=${best.f1.toFixed(3)} | P=${best.precision.toFixed(3)} | R=${best.recall.toFixed(3)}\n` +
    `TP=${best.tp} FP=${best.fp} TN=${best.tn} FN=${best.fn} sur ${records.length} images val`;

  return { threshold: best.t, report, evalAtBest: best };
}