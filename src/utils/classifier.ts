import { classifyDataUrl, MODEL_PREFIX } from "@/utils/inference";
import { getSettings } from "@/utils/settings";
import { idbGet } from "@/utils/idb";

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

export async function classifyImageToTag(dataUrl: string): Promise<{
  topLabel: string;
  topScore: number;
  threshold: number;
  isSuspect: boolean;
  suggestedTag: string;
}> {
  const s = getSettings();
  const threshold = s.inference?.threshold ?? 0.6;
  const { topLabel, topScore } = await classifyDataUrl(dataUrl);

  const isSuspect = topLabel !== "plain" && topScore >= threshold;

  // Mapping label->tag si défini, sinon on réutilise l’étiquette brute du modèle
  const suggestedTag = (s.classMapping && s.classMapping[topLabel]) || topLabel;

  return { topLabel, topScore, threshold, isSuspect, suggestedTag };
}
