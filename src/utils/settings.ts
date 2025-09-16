export type APIProvider = "openai" | "anthropic" | "google" | "azure";

export type APISettings = {
  provider: APIProvider;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  endpoint?: string; // custom endpoint (ex: Azure/OpenAI proxy)
  azureDeployment?: string; // nom du déploiement Azure OpenAI si provider=azure
  updatedAt: string;
};

const STORAGE_KEY = "api_settings";

export function getDefaultSettings(): APISettings {
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 2000,
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
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}