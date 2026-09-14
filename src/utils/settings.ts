import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";

export type APIProvider = "openai" | "anthropic" | "google" | "azure";
export type BackgroundMode = "image" | "color";
/** Comment l'image de fond occupe l'écran. "custom" utilise backgroundScale. */
export type BackgroundFit = "cover" | "contain" | "custom";

/**
 * Valeurs d'apparence transportées par l'événement "settings:updated".
 *
 * L'onglet Apparence émet ses valeurs à chaque modification, avant tout
 * enregistrement, pour que le fond se mette à jour en direct. Sans ces valeurs
 * l'écouteur relit simplement ce qui est persisté.
 */
export type AppearanceOverride = Partial<
  Pick<
    Settings,
    | "backgroundMode"
    | "backgroundImage"
    | "backgroundColor"
    | "backgroundDim"
    | "backgroundFit"
    | "backgroundScale"
    | "themePreset"
    | "brightness"
  >
>;
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

export type Settings = {
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
  backgroundFit?: BackgroundFit;
  /** Taille de l'image en %, appliquée uniquement quand backgroundFit vaut "custom". */
  backgroundScale?: number;
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
    // Aucune image n'est livrée avec l'application : le fond par défaut est une
    // couleur unie. Chacun charge la sienne depuis Paramètres > Apparence.
    backgroundMode: "color",
    backgroundImage: undefined,
    backgroundColor: "#0b1220",
    backgroundDim: 20,
    backgroundFit: "cover",
    backgroundScale: 100,
    themePreset: "blue",
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

/**
 * Horodatage réellement persisté, lu sur le JSON brut.
 *
 * getSettings() complète les champs manquants avec getDefaultSettings(), dont
 * l'updatedAt vaut "maintenant" — s'en servir pour arbitrer local/cloud ferait
 * systématiquement gagner le local. On lit donc la valeur stockée, ou rien.
 */
function getStoredUpdatedAt(): string | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return typeof parsed?.updatedAt === "string" ? parsed.updatedAt : undefined;
  } catch {
    return undefined;
  }
}

/** true si `a` est strictement postérieur à `b`. Un local sans horodatage ne gagne jamais. */
function isNewer(a?: string, b?: string): boolean {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (Number.isNaN(ta)) return false;
  if (Number.isNaN(tb)) return true;
  return ta > tb;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  // Horodater chaque écriture : c'est ce qui permet à loadSettingsFromCloud()
  // de savoir laquelle des deux copies fait foi.
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  // Sauvegarde asynchrone dans Supabase si l'utilisateur est connecté
  void syncSettingsToCloud(next);

  return next;
}

// Évite d'empiler les toasts quand plusieurs réglages échouent d'affilée.
let syncErrorNotifiedAt = 0;
const SYNC_ERROR_QUIET_MS = 30_000;

/**
 * Pousse les réglages vers Supabase, et le dit quand ça rate.
 *
 * Un échec avalé en silence ne se voyait qu'à retardement : la copie cloud
 * restait en arrière, puis le prochain loadSettingsFromCloud() écrasait le
 * réglage local. C'est ainsi qu'un modelMeta pouvait disparaître sans un mot.
 *
 * @returns true si l'écriture a abouti.
 */
async function syncSettingsToCloud(settings: Settings): Promise<boolean> {
  // Use getSession (cached) instead of getUser (network call) for background sync
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false; // non connecté : rien à synchroniser, rien à signaler

  const { error } = await supabase
    .from('profiles')
    .update({ settings })
    .eq('id', session.user.id);

  if (error) {
    console.error("Échec de la sauvegarde des réglages sur Supabase", error);
    const now = Date.now();
    if (now - syncErrorNotifiedAt > SYNC_ERROR_QUIET_MS) {
      syncErrorNotifiedAt = now;
      showError(
        `Réglages non sauvegardés en ligne (${error.message}). ` +
        `Ils restent actifs sur cet appareil, mais ne suivront pas votre compte.`,
      );
    }
    return false;
  }

  syncErrorNotifiedAt = 0;
  return true;
}

export async function loadSettingsFromCloud(): Promise<Settings> {
  // Use getSession (cached) instead of getUser (network call)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return getSettings();

  const { data, error } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', session.user.id)
    .single();

  if (error || !data?.settings) {
    if (error) console.error("Lecture des réglages depuis Supabase impossible", error);
    return getSettings();
  }

  const cloudSettings = data.settings as Settings;

  // Le local est plus récent que le cloud : une écriture n'est pas passée.
  // Écraser ici ferait disparaître un réglage que l'utilisateur vient de faire,
  // sans aucun signe. On garde le local et on retente de le pousser.
  const localUpdatedAt = getStoredUpdatedAt();
  if (isNewer(localUpdatedAt, cloudSettings.updatedAt)) {
    console.warn(
      "Réglages locaux plus récents que le cloud — conservation du local, nouvelle tentative de synchronisation.",
      { localUpdatedAt, cloudUpdatedAt: cloudSettings.updatedAt },
    );
    const local = getSettings();
    void syncSettingsToCloud(local);
    return local;
  }

  const merged = { ...getDefaultSettings(), ...cloudSettings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}