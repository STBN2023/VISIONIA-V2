import { supabase } from "@/integrations/supabase/client";

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

export type Settings = {
  apiKey?: string;
  provider: APIProvider;
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

const STORAGE_KEY = "isoedre_settings_v1";

export function getDefaultSettings(): Settings {
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

export function getSettings(): Settings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return getDefaultSettings();
  try {
    return { ...getDefaultSettings(), ...JSON.parse(raw) };
  } catch {
    return getDefaultSettings();
  }
}

export function saveSettings(patch: Partial<Settings>) {
  const current = getSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  
  // Sauvegarde asynchrone dans Supabase si l'utilisateur est connecté
  syncSettingsToCloud(next);
}

async function syncSettingsToCloud(settings: Settings) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('profiles')
    .update({ settings })
    .eq('id', user.id);
}

export async function loadSettingsFromCloud(): Promise<Settings> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return getSettings();

  const { data, error } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', user.id)
    .single();

  if (!error && data?.settings) {
    const cloudSettings = data.settings as Settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudSettings));
    return cloudSettings;
  }
  return getSettings();
}