import { classifyDataUrl } from "@/utils/inference";
import { getSettings } from "@/utils/settings";

export function isModelConfigured(): boolean {
  const s = getSettings();
  return !!s.modelRef && !!s.modelMeta?.classesOrder?.length;
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