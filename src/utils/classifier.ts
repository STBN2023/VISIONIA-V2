import { classifyDataUrl, MODEL_PREFIX } from "@/utils/inference";
import { getSettings } from "@/utils/settings";
import { idbGet } from "@/utils/idb";

/** Étiquette du dataset désignant une photo sans désordre. */
export const PLAIN_LABEL = "plain";

export type ClassScore = {
  /** Étiquette brute du modèle (ex: "major_crack"). */
  label: string;
  /** Étiquette métier après classMapping (ex: "fissure majeure"). */
  tag: string;
  score: number;
};

export function isModelConfigured(): boolean {
  const s = getSettings();
  return !!s.modelRef && !!s.modelMeta?.classesOrder?.length;
}

/**
 * Vérifie que le modèle est réellement utilisable, et pas seulement déclaré
 * dans les réglages. Les réglages (modelRef, modelMeta) sont synchronisés via
 * Supabase, alors que les poids .onnx vivent dans IndexedDB, qui est cloisonné
 * par navigateur et par origine. Un modèle importé sur localhost est donc
 * absent sur le domaine déployé, alors que isModelConfigured() répond "oui".
 *
 * @returns null si le modèle est utilisable, sinon le message à afficher.
 */
export async function getModelUnavailableReason(): Promise<string | null> {
  const s = getSettings();

  if (!s.modelRef) {
    return "Aucun modèle configuré. Importez un fichier .onnx dans Paramètres > Dataset.";
  }
  if (!s.modelMeta?.classesOrder?.length) {
    return "L'ordre des classes du modèle n'est pas défini. Complétez-le dans Paramètres > Dataset.";
  }
  if (s.modelRef.source === "idb") {
    const bytes = await idbGet(MODEL_PREFIX + s.modelRef.value);
    if (!bytes) {
      return (
        "Le modèle est absent de ce navigateur. Les poids .onnx sont stockés localement " +
        "et ne suivent pas votre compte : réimportez le fichier dans Paramètres > Dataset, " +
        "ou renseignez une URL pour l'héberger une fois pour toutes."
      );
    }
  }
  return null;
}

/**
 * Probabilité que la photo présente un désordre, quel qu'il soit.
 *
 * Le modèle est mono-étiquette : sa sortie passe par un softmax, donc les
 * classes se partagent 100 %. Une photo cumulant deux défauts répartit sa masse
 * (ex: 45 % / 40 %) et retombe sous le seuil sur chaque classe prise isolément,
 * alors que la probabilité qu'elle soit saine n'est que de 15 %. Raisonner sur
 * le complément de "plain" plutôt que sur le top-1 évite d'écarter précisément
 * les photos les plus chargées.
 */
export function defectScoreFrom(probs: number[]): number {
  const order = getSettings().modelMeta?.classesOrder ?? [];
  const plainIdx = order.indexOf(PLAIN_LABEL);
  if (plainIdx < 0 || plainIdx >= probs.length) {
    // Modèle sans classe "plain" : on retombe sur la confiance du top-1.
    return probs.length ? Math.max(...probs) : 0;
  }
  return 1 - (probs[plainIdx] ?? 0);
}

/** Une photo est suspecte si le modèle la juge globalement non saine. */
export function isSuspectFrom(probs: number[], threshold?: number): boolean {
  const t = threshold ?? getSettings().inference?.threshold ?? 0.6;
  return defectScoreFrom(probs) >= t;
}

/**
 * Classes de défaut les plus probables, hors "plain", triées par score.
 *
 * Attention à l'interprétation : un softmax ne distingue pas « deux défauts
 * présents » de « le modèle hésite entre deux étiquettes pour un seul défaut ».
 * Ces valeurs sont des suggestions à confirmer, pas des détections.
 */
export function topClassesFrom(
  probs: number[],
  opts?: { max?: number; min?: number },
): ClassScore[] {
  const s = getSettings();
  const order = s.modelMeta?.classesOrder ?? [];
  const mapping = s.classMapping ?? {};
  const max = opts?.max ?? 3;
  const min = opts?.min ?? 0.1;

  return probs
    .map((score, i) => ({ label: order[i] ?? String(i), score }))
    .filter((c) => c.label !== PLAIN_LABEL && c.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((c) => ({ ...c, tag: mapping[c.label] || c.label }));
}

export async function classifyImageToTag(dataUrl: string): Promise<{
  topLabel: string;
  topScore: number;
  threshold: number;
  isSuspect: boolean;
  suggestedTag: string;
  probs: number[];
  defectScore: number;
  topClasses: ClassScore[];
}> {
  const s = getSettings();
  const threshold = s.inference?.threshold ?? 0.6;
  const { topLabel, topScore, probs } = await classifyDataUrl(dataUrl);

  const defectScore = defectScoreFrom(probs);
  const isSuspect = isSuspectFrom(probs, threshold);

  // Mapping label->tag si défini, sinon on réutilise l’étiquette brute du modèle
  const suggestedTag = (s.classMapping && s.classMapping[topLabel]) || topLabel;

  return {
    topLabel,
    topScore,
    threshold,
    isSuspect,
    suggestedTag,
    probs,
    defectScore,
    topClasses: topClassesFrom(probs),
  };
}
