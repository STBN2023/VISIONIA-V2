import { supabase } from "@/integrations/supabase/client";
import type { ProjectImage } from "@/utils/storage";

export type RunMode = "per_image" | "aggregate";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type RunItemStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Box = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label?: string;
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
  boxes?: Box[];
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
  items: RunItem[];
  outputText?: string;
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

// ---- Mapping helpers ----

function mapDbRun(dbRun: any): Run {
  return {
    id: dbRun.id,
    projectId: dbRun.project_id,
    mode: dbRun.mode as RunMode,
    status: dbRun.status as RunStatus,
    prompt: dbRun.prompt || "",
    model: dbRun.model,
    temperature: dbRun.temperature,
    createdAt: dbRun.created_at,
    updatedAt: dbRun.updated_at,
    outputText: dbRun.output_text,
    error: dbRun.error,
    items: (dbRun.run_items || []).map((item: any) => ({
      id: item.id,
      imageId: item.image_id || "",
      status: item.status as RunItemStatus,
      outputText: item.output_text,
      error: item.error,
      startedAt: item.started_at,
      finishedAt: item.finished_at,
      boxes: Array.isArray(item.boxes) ? item.boxes : [],
    })),
  };
}

// ---- localStorage fallback for backward compat (read-only, for migration) ----

function readLocalRuns(): Run[] {
  const raw = localStorage.getItem("runs");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Run[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- Supabase CRUD ----

export function getRunsByProjectId(projectId: string): Run[] {
  // This is called synchronously from polling — we use a cache approach
  // The actual data is loaded async and cached
  return getCachedRuns(projectId);
}

// In-memory cache for runs (refreshed by polling)
let _runsCache: Map<string, { runs: Run[]; ts: number }> = new Map();
const CACHE_TTL = 800; // ms

function getCachedRuns(projectId: string): Run[] {
  const cached = _runsCache.get(projectId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.runs;
  }
  // Trigger async refresh (non-blocking)
  refreshRunsCache(projectId);
  return cached?.runs || [];
}

async function refreshRunsCache(projectId: string) {
  try {
    const { data, error } = await supabase
      .from("runs")
      .select(`*, run_items(*)`)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching runs:", error);
      return;
    }

    const runs = (data || []).map(mapDbRun);

    // Also check localStorage for legacy runs not yet migrated
    const localRuns = readLocalRuns().filter(
      (r) => r.projectId === projectId && !runs.some((sr) => sr.id === r.id)
    );

    const merged = [...runs, ...localRuns].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    _runsCache.set(projectId, { runs: merged, ts: Date.now() });
  } catch (e) {
    console.error("Error refreshing runs cache:", e);
  }
}

export async function getRunByIdAsync(id: string): Promise<Run | undefined> {
  const { data, error } = await supabase
    .from("runs")
    .select(`*, run_items(*)`)
    .eq("id", id)
    .single();

  if (error || !data) {
    // Fallback to localStorage
    const local = readLocalRuns().find((r) => r.id === id);
    return local;
  }
  return mapDbRun(data);
}

// Synchronous getter (from cache or localStorage fallback)
export function getRunById(id: string): Run | undefined {
  // Search all cached projects
  for (const [, cached] of _runsCache) {
    const found = cached.runs.find((r) => r.id === id);
    if (found) return found;
  }
  // Fallback to localStorage
  return readLocalRuns().find((r) => r.id === id);
}

export async function deleteRun(runId: string) {
  // Delete from Supabase (cascade deletes run_items)
  const { error } = await supabase.from("runs").delete().eq("id", runId);
  if (error) {
    console.error("Error deleting run:", error);
  }
  // Also remove from localStorage if present
  const local = readLocalRuns().filter((r) => r.id !== runId);
  localStorage.setItem("runs", JSON.stringify(local));
  // Invalidate cache
  _runsCache.clear();
}

export async function createPendingRun(input: CreateRunInput): Promise<Run> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const now = new Date().toISOString();

  // Insert run
  const { data: runData, error: runError } = await supabase
    .from("runs")
    .insert({
      project_id: input.projectId,
      user_id: user.id,
      mode: input.mode,
      status: "running",
      prompt: input.prompt,
      model: input.model,
      temperature: input.temperature,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (runError || !runData) throw new Error(runError?.message || "Failed to create run");

  // Insert run items (for per_image mode)
  const items: RunItem[] = [];
  if (input.mode === "per_image") {
    for (const img of input.images) {
      const { data: itemData, error: itemError } = await supabase
        .from("run_items")
        .insert({
          run_id: runData.id,
          image_id: img.id,
          status: "running",
          started_at: now,
        })
        .select()
        .single();

      if (!itemError && itemData) {
        items.push({
          id: itemData.id,
          imageId: img.id,
          status: "running",
          startedAt: now,
          boxes: [],
        });
      }
    }
  }

  const run: Run = {
    id: runData.id,
    projectId: input.projectId,
    mode: input.mode,
    status: "running",
    prompt: input.prompt,
    model: input.model,
    temperature: input.temperature,
    createdAt: now,
    updatedAt: now,
    items,
  };

  // Update cache immediately
  const cached = _runsCache.get(input.projectId);
  if (cached) {
    cached.runs.unshift(run);
    cached.ts = Date.now();
  }

  return run;
}

export async function completeRunWithServer(
  runId: string,
  payload:
    | { mode: "aggregate"; outputText: string; items?: { imageId?: string; outputText: string; boxes?: Box[] }[] }
    | { mode: "per_image"; items: { imageId?: string; outputText: string; boxes?: Box[] }[] }
) {
  const now = new Date().toISOString();

  if (payload.mode === "aggregate") {
    // Update run with output text
    await supabase
      .from("runs")
      .update({
        output_text: payload.outputText,
        status: "succeeded",
        updated_at: now,
      })
      .eq("id", runId);

    // Insert/update items
    if (Array.isArray(payload.items)) {
      for (const item of payload.items) {
        if (!item.imageId) continue;
        await supabase.from("run_items").insert({
          run_id: runId,
          image_id: item.imageId,
          status: "succeeded",
          output_text: item.outputText,
          boxes: Array.isArray(item.boxes) ? item.boxes : [],
          finished_at: now,
        });
      }
    }
  } else {
    // per_image: update existing items
    for (const item of payload.items) {
      if (!item.imageId) continue;
      // Try to update existing item by run_id + image_id
      const { data: existing } = await supabase
        .from("run_items")
        .select("id")
        .eq("run_id", runId)
        .eq("image_id", item.imageId)
        .single();

      if (existing) {
        await supabase
          .from("run_items")
          .update({
            status: "succeeded",
            output_text: item.outputText,
            boxes: Array.isArray(item.boxes) ? item.boxes : [],
            finished_at: now,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("run_items").insert({
          run_id: runId,
          image_id: item.imageId,
          status: "succeeded",
          output_text: item.outputText,
          boxes: Array.isArray(item.boxes) ? item.boxes : [],
          finished_at: now,
        });
      }
    }

    // Check if all items succeeded
    const { data: allItems } = await supabase
      .from("run_items")
      .select("status")
      .eq("run_id", runId);

    const allSucceeded = (allItems || []).every((i: any) => i.status === "succeeded");
    await supabase
      .from("runs")
      .update({
        status: allSucceeded ? "succeeded" : "failed",
        updated_at: now,
      })
      .eq("id", runId);
  }

  // Invalidate cache
  _runsCache.clear();
}

export async function failRun(runId: string, error: string) {
  const now = new Date().toISOString();

  await supabase
    .from("runs")
    .update({ status: "failed", error, updated_at: now })
    .eq("id", runId);

  // Mark running/queued items as failed
  await supabase
    .from("run_items")
    .update({ status: "failed", error, finished_at: now })
    .eq("run_id", runId)
    .in("status", ["running", "queued"]);

  _runsCache.clear();
}

export async function cancelRun(runId: string) {
  const now = new Date().toISOString();

  const run = getRunById(runId);
  if (!run) return;
  if (["succeeded", "failed", "cancelled"].includes(run.status)) return;

  await supabase
    .from("runs")
    .update({ status: "cancelled", updated_at: now })
    .eq("id", runId);

  await supabase
    .from("run_items")
    .update({ status: "cancelled", finished_at: now })
    .eq("run_id", runId)
    .in("status", ["running", "queued"]);

  _runsCache.clear();
}

export async function retryFailedItems(runId: string, images: ProjectImage[]) {
  const run = await getRunByIdAsync(runId);
  if (!run || run.mode === "aggregate") return;

  const failedItems = run.items.filter((it) => it.status === "failed");
  if (failedItems.length === 0) return;

  for (const item of failedItems) {
    await supabase
      .from("run_items")
      .update({
        status: "queued",
        error: null,
        output_text: null,
        started_at: null,
        finished_at: null,
      })
      .eq("id", item.id);
  }

  await supabase
    .from("runs")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("id", runId);

  _runsCache.clear();
}

export async function updateRunItemBoxes(runId: string, itemId: string, boxes: Box[]) {
  await supabase
    .from("run_items")
    .update({ boxes: boxes.map((b) => ({ ...b })) })
    .eq("id", itemId);

  await supabase
    .from("runs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", runId);

  _runsCache.clear();
}

// Legacy simulation functions (kept as no-ops for backward compat)
export function createRun(input: CreateRunInput): Run {
  // Redirect to async version — caller should use createPendingRun instead
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
    items: [],
  };
  // Fire and forget the async creation
  createPendingRun(input).catch(console.error);
  return run;
}
