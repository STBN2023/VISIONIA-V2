import type { ProjectImage } from "@/utils/storage";

export type RunMode = "per_image" | "aggregate";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type RunItemStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Box = {
  id: string;
  // Coordonnées normalisées (0..1) relatives à l’image
  x: number;
  y: number;
  w: number;
  h: number;
  color: string; // hex (#22C55E) ou css color
  label?: string;
  // Nouvel attribut: angle en degrés (rotation autour du centre du rectangle)
  angle?: number;
};

export type RunItem = {
  id: string;
  imageId: string;
  status: RunItemStatus;
  outputText?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  boxes?: Box[]; // annotations
};

export type Run = {
  id: string;
  projectId: string;
  mode: RunMode;
  status: RunStatus;
  prompt: string;
  model?: string;
  temperature?: number;
  createdAt: string;
  updatedAt: string;
  items: RunItem[]; // peut être utilisé aussi en mode aggregate
  outputText?: string; // texte global si aggregate
  error?: string;
};

export type CreateRunInput = {
  projectId: string;
  mode: RunMode;
  prompt: string;
  images: ProjectImage[];
  model?: string;
  temperature?: number;
};

const STORAGE_KEY = "runs";

function readAll(): Run[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Run[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(runs: Run[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

function write(run: Run) {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === run.id);
  if (idx === -1) {
    all.push(run);
  } else {
    all[idx] = run;
  }
  writeAll(all);
}

export function getRunsByProjectId(projectId: string): Run[] {
  return readAll()
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getRunById(id: string): Run | undefined {
  return readAll().find((r) => r.id === id);
}

export function deleteRun(runId: string) {
  const all = readAll();
  const next = all.filter((r) => r.id !== runId);
  writeAll(next);
}

// Simulation (legacy) conservée mais non utilisée pour le chemin LLM:
export function createRun(input: CreateRunInput): Run {
  const now = new Date().toISOString();
  const run: Run = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    mode: input.mode,
    status: "queued",
    prompt: input.prompt,
    model: input.model,
    temperature: input.temperature,
    createdAt: now,
    updatedAt: now,
    items:
      input.mode === "per_image"
        ? input.images.map((img) => ({
            id: crypto.randomUUID(),
            imageId: img.id,
            status: "queued",
          }))
        : [],
  };
  write(run);
  setTimeout(() => simulateRun(run.id, input.images), 0);
  return run;
}

// Nouveau: crée un run déjà en "running" (sans simulation)
export function createPendingRun(input: CreateRunInput): Run {
  const now = new Date().toISOString();
  const run: Run = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    mode: input.mode,
    status: "running",
    prompt: input.prompt,
    model: input.model,
    temperature: input.temperature,
    createdAt: now,
    updatedAt: now,
    items:
      input.mode === "per_image"
        ? input.images.map((img) => ({
            id: crypto.randomUUID(),
            imageId: img.id,
            status: "running",
            startedAt: new Date().toISOString(),
          }))
        : [],
  };
  write(run);
  return run;
}

// Nouveau: complète un run avec les résultats venus de l’IA
export function completeRunWithServer(
  runId: string,
  payload:
    | { mode: "aggregate"; outputText: string; items?: { imageId?: string; outputText: string; boxes?: Box[] }[] }
    | {
        mode: "per_image";
        items: { imageId?: string; outputText: string; boxes?: Box[] }[];
      },
) {
  const run = getRunById(runId);
  if (!run) return;
  if (payload.mode === "aggregate") {
    run.outputText = payload.outputText;
    if (Array.isArray(payload.items)) {
      // Injecte/écrase les items par image en succeeded
      run.items = payload.items
        .map((x) => ({
          id: crypto.randomUUID(),
          imageId: String(x.imageId || ""),
          status: "succeeded" as RunItemStatus,
          outputText: x.outputText,
          boxes: Array.isArray(x.boxes) ? x.boxes.map((b) => ({ ...b })) : [],
          finishedAt: new Date().toISOString(),
        }))
        .filter((it) => it.imageId);
    }
    run.status = "succeeded";
  } else if (payload.mode === "per_image") {
    run.items = run.items.map((it) => {
      const match = payload.items.find((x) => x.imageId === it.imageId);
      if (match) {
        return {
          ...it,
          status: "succeeded",
          outputText: match.outputText,
          boxes: Array.isArray(match.boxes) ? match.boxes.map((b) => ({ ...b })) : it.boxes,
          finishedAt: new Date().toISOString(),
        };
      }
      return it;
    });
    const allHaveOutput = run.items.every((i) => i.status === "succeeded");
    run.status = allHaveOutput ? "succeeded" : "failed";
  }
  run.updatedAt = new Date().toISOString();
  write(run);
}

// Nouveau: marque un run comme échec avec message
export function failRun(runId: string, error: string) {
  const run = getRunById(runId);
  if (!run) return;
  if (run.mode === "per_image") {
    run.items = run.items.map((it) =>
      it.status === "running" || it.status === "queued"
        ? { ...it, status: "failed", error, finishedAt: new Date().toISOString() }
        : it,
    );
  }
  run.status = "failed";
  run.error = error;
  run.updatedAt = new Date().toISOString();
  write(run);
}

export function cancelRun(runId: string) {
  const run = getRunById(runId);
  if (!run) return;
  if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") return;
  run.status = "cancelled";
  run.updatedAt = new Date().toISOString();
  run.items = run.items.map((it) =>
    it.status === "queued" || it.status === "running" ? { ...it, status: "cancelled", finishedAt: new Date().toISOString() } : it,
  );
  write(run);
}

export function retryFailedItems(runId: string, images: ProjectImage[]) {
  const run = getRunById(runId);
  if (!run) return;
  if (run.mode === "aggregate") return; // rien à faire pour aggregate
  let changed = false;
  run.items = run.items.map((it) => {
    if (it.status === "failed") {
      changed = true;
      return { ...it, status: "queued", error: undefined, outputText: undefined, startedAt: undefined, finishedAt: undefined };
    }
    return it;
  });
  if (changed) {
    run.status = "queued";
    run.updatedAt = new Date().toISOString();
    write(run);
    setTimeout(() => simulateRun(run.id, images), 0);
  }
}

// --- Annotations ---
export function updateRunItemBoxes(runId: string, itemId: string, boxes: Box[]) {
  const run = getRunById(runId);
  if (!run) return;
  const idx = run.items.findIndex((i) => i.id === itemId);
  if (idx === -1) return;
  run.items[idx] = { ...run.items[idx], boxes: boxes.map((b) => ({ ...b })) };
  run.updatedAt = new Date().toISOString();
  write(run);
}

// --- Simulation (legacy) ---
function simulateRun(runId: string, images: ProjectImage[]) {
  const run = getRunById(runId);
  if (!run) return;

  run.status = "running";
  run.updatedAt = new Date().toISOString();
  write(run);

  if (run.mode === "aggregate") {
    const delay = 800 + Math.floor(Math.random() * 700);
    setTimeout(() => {
      const finalRun = getRunById(runId);
      if (!finalRun || finalRun.status === "cancelled") return;
      finalRun.outputText = generateAggregateReport(run.prompt, images);
      finalRun.status = "succeeded";
      finalRun.updatedAt = new Date().toISOString();
      write(finalRun);
    }, delay);
  } else {
    const items = run.items;
    items.forEach((item, idx) => {
      const startDelay = 300 + idx * 400;
      setTimeout(() => {
        const r = getRunById(runId);
        if (!r || r.status === "cancelled") return;
        const itIndex = r.items.findIndex((it) => it.id === item.id);
        if (itIndex === -1) return;

        const img = images.find((im) => im.id === r.items[itIndex].imageId);
        r.items[itIndex] = {
          ...r.items[itIndex],
          status: "running",
          startedAt: new Date().toISOString(),
        };
        r.updatedAt = new Date().toISOString();
        write(r);

        const duration = 500 + Math.floor(Math.random() * 800);
        setTimeout(() => {
          const r2 = getRunById(runId);
          if (!r2 || r2.status === "cancelled") return;
          const ii = r2.items.findIndex((it) => it.id === item.id);
          if (ii === -1) return;

          const ok = Math.random() < 0.9;
          if (ok) {
            r2.items[ii] = {
              ...r2.items[ii],
              status: "succeeded",
              outputText: generatePerImageReport(run.prompt, img),
              finishedAt: new Date().toISOString(),
            };
          } else {
            r2.items[ii] = {
              ...r2.items[ii],
              status: "failed",
              error: "Erreur simulée d'analyse",
              finishedAt: new Date().toISOString(),
            };
          }
          const allDone = r2.items.every((it) => ["succeeded", "failed", "cancelled"].includes(it.status));
          if (allDone) {
            const allOk = r2.items.every((it) => it.status === "succeeded");
            r2.status = allOk ? "succeeded" : "failed";
          }
          r2.updatedAt = new Date().toISOString();
          write(r2);
        }, duration);
      }, startDelay);
    });
  }
}

function wrapSection(title: string, content: string) {
  return `${title}\n${content}\n`;
}

function generateAggregateReport(prompt: string, images: ProjectImage[]): string {
  const tags = images.map((i) => i.tag || "non taguée").slice(0, 8);
  const header = `Synthèse multi-images (${images.length} image${images.length > 1 ? "s" : ""})`;
  const constat = `- Constat basé sur un lot d'images (${tags.join(", ")}).`;
  const solutions = `- Propositions consolidées et dédupliquées.`;
  const conformite = `- Références probables mentionnées selon le prompt.`;
  return [header, "", wrapSection("Constat technique:", constat), wrapSection("Solutions correctives:", solutions), wrapSection("Conformité réglementaire:", conformite), "", "Note: génération simulée (sans appel LLM) à partir du prompt actuel."].join("\n");
}

function generatePerImageReport(prompt: string, img?: ProjectImage): string {
  const tag = img?.tag ? ` (${img.tag})` : "";
  const name = img?.name || "image";
  const constat = `- Observations ciblées sur ${name}${tag}.`;
  const solutions = `- Actions correctives spécifiques.`;
  const conformite = `- Références réglementaires probables.`;
  return [wrapSection("Constat technique:", constat), wrapSection("Solutions correctives:", solutions), wrapSection("Conformité réglementaire:", conformite)].join("\n");
}