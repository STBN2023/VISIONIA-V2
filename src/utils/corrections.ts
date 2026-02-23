export type CorrectionStats = {
  // key: fromTag (normalisé)
  [fromKey: string]: {
    total: number;
    // key: toTag (normalisé)
    to: {
      [toKey: string]: {
        count: number;
        last: string; // dernière forme 'to' telle que choisie (pour restituer la casse)
      };
    };
  };
};

const STORAGE_KEY = "corrections_stats";

function normalizeLabelForKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeLabelForm(s: string): string {
  // garde la casse utilisateur mais nettoie les espaces
  return s.trim().replace(/\s+/g, " ");
}

function getStats(): CorrectionStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CorrectionStats;
  } catch {
    return {};
  }
}

function saveStats(stats: CorrectionStats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function recordCorrection(fromTag: string, toTag: string) {
  const fromKey = normalizeLabelForKey(fromTag);
  const toKey = normalizeLabelForKey(toTag);
  const toForm = normalizeLabelForm(toTag);

  const stats = getStats();
  if (!stats[fromKey]) {
    stats[fromKey] = { total: 0, to: {} };
  }
  stats[fromKey].total += 1;
  if (!stats[fromKey].to[toKey]) {
    stats[fromKey].to[toKey] = { count: 0, last: toForm };
  }
  stats[fromKey].to[toKey].count += 1;
  stats[fromKey].to[toKey].last = toForm;

  saveStats(stats);
}

export function getPreferredCorrection(fromTag: string, opts?: { minCount?: number; minRatio?: number }): string | undefined {
  const { minCount = 3, minRatio = 0.6 } = opts || {};
  const fromKey = normalizeLabelForKey(fromTag);
  const stats = getStats();
  const bucket = stats[fromKey];
  if (!bucket || bucket.total === 0) return undefined;

  // trouver la cible la plus fréquente
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [toKey, data] of Object.entries(bucket.to)) {
    if (data.count > bestCount) {
      bestCount = data.count;
      bestKey = toKey;
    }
  }
  if (!bestKey) return undefined;

  const ratio = bestCount / bucket.total;
  if (bestCount >= minCount && ratio >= minRatio) {
    return bucket.to[bestKey].last; // restitue une forme lisible (dernière forme choisie)
  }
  return undefined;
}

export function applyCorrectionPreference(suggestedTag: string, opts?: { minCount?: number; minRatio?: number }): string {
  const pref = getPreferredCorrection(suggestedTag, opts);
  return pref ?? suggestedTag;
}