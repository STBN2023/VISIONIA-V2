export type APIProvider = "openai" | "anthropic" | "google" | "azure";
export type BackgroundMode = "image" | "color";
export type ThemePreset = "violet" | "blue" | "neutral";

export type DatasetRef = { datasetId: string; datasetName: string };
export type ClassesDetected = {
  unionClasses: string[];
  perSplitClasses: {
    train: string[];
    val: string[];
    test: string[];
  };
};
export type ModelRef = { source: "idb" | "url"; value: string };
export type ModelMeta = {
  inputSize: number;
  channelsOrder: "RGB";
  normalization?: { scale?: number; mean?: number[]; std?: number[] };
  classesOrder: string[];
  version?: string;
};
export type InferenceSettings = {
  threshold: number;
  backendPreference?: "webgpu" | "webgl" | "wasm";
  batchSize?: number;
  warmup?: boolean;
};

export type APISettings = {
  provider: APIProvider;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  endpoint?: string;
  azureDeployment?: string;
  // Apparence
  backgroundMode?: BackgroundMode;
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundDim?: number;
  themePreset?: ThemePreset;
  brightness?: number;
  // Dataset & IA
  datasetRef?: DatasetRef;
  classesDetected?: ClassesDetected;
  classMapping?: Record<string, string>;
  modelRef?: ModelRef;
  modelMeta?: ModelMeta;
  inference?: InferenceSettings;
  calibrationReport?: {
    date: string;
    sampleSize?: number;
    criterion?: string;
    thresholdRecommended?: number;
    metricsSummary?: string;
  };
  updatedAt: string;
};

const STORAGE_KEY = "api_settings";

export function getDefaultSettings(): APISettings {
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 2000,
    backgroundMode: "image",
    backgroundImage:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=2400&auto=format&fit=crop",
    backgroundColor: "#0b1220",
    backgroundDim: 20,
    themePreset: "violet",
    brightness: 100,
    // Defaults Dataset & IA
    datasetRef: undefined,
    classesDetected: undefined,
    classMapping: undefined,
    modelRef: undefined,
    modelMeta: undefined,
    inference: { threshold: 0.6, backendPreference: "webgpu", batchSize: 1, warmup: false },
    calibrationReport: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function getSettings(): APISettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return getDefaultSettings();
  try {
    const parsed = JSON.parse(raw) as APISettings;
    return {
      ...getDefaultSettings(),
      ...parsed,
      brightness: typeof parsed.brightness === "number" ? parsed.brightness : 100,
      // garder inference et autres telles quelles si définies
      inference: parsed.inference || getDefaultSettings().inference,
    };
  } catch {
    return getDefaultSettings();
  }
}

export function saveSettings(patch: Partial<APISettings>): APISettings {
  const curr = getSettings();
  const next: APISettings = {
    ...curr,
    ...patch,
    // clamp de sécurité
    backgroundDim: Math.max(0, Math.min(100, Number(patch.backgroundDim ?? curr.backgroundDim ?? 20))),
    brightness: Math.max(50, Math.min(150, Number(patch.brightness ?? curr.brightness ?? 100))),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("settings:updated", { detail: next }));
    }
  } catch {
    // no-op
  }
  return next;
}