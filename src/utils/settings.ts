export type APIProvider = "openai" | "anthropic" | "google" | "azure";
export type BackgroundMode = "image" | "color";
export type ThemePreset = "violet" | "blue" | "neutral";

export type APISettings = {
  provider: APIProvider;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  endpoint?: string; // custom endpoint (ex: Azure/OpenAI proxy)
  azureDeployment?: string; // nom du déploiement Azure OpenAI si provider=azure
  // Apparence
  backgroundMode?: BackgroundMode; // image | color
  backgroundImage?: string;
  backgroundColor?: string; // hex
  backgroundDim?: number; // 0..100 (voile sombre)
  themePreset?: ThemePreset; // palette d’accent globale
  brightness?: number; // 50..150 % (100 par défaut)
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
      // normalisation douce
      brightness: typeof parsed.brightness === "number" ? parsed.brightness : 100,
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
  // Notifier l'app (update dynamique du fond)
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("settings:updated", { detail: next }));
    }
  } catch {
    // no-op
  }
  return next;
}