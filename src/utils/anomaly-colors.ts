export type AnomalyType =
  | "fissure"
  | "infiltration"
  | "humidite"
  | "isolation"
  | "pont_thermique"
  | "menuiserie"
  | "toiture"
  | "moisissure"
  | "structure"
  | "electrique"
  | "plomberie"
  | "vegetation"
  | "autre";

export const ANOMALY_COLORS: Record<AnomalyType, string> = {
  fissure: "#EF4444",        // red-500
  infiltration: "#3B82F6",   // blue-500
  humidite: "#60A5FA",       // blue-400
  isolation: "#F59E0B",      // amber-500
  pont_thermique: "#F97316", // orange-500
  menuiserie: "#14B8A6",     // teal-500
  toiture: "#EAB308",        // yellow-500
  moisissure: "#8B5CF6",     // violet-500
  structure: "#DC2626",      // red-600
  electrique: "#F43F5E",     // rose-500
  plomberie: "#06B6D4",      // cyan-500
  vegetation: "#22C55E",     // green-500
  autre: "#9CA3AF",          // gray-400
};

function includesAny(s: string, words: string[]) {
  return words.some((w) => s.includes(w));
}

export function guessType(from?: string): AnomalyType {
  const s = (from || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (!s) return "autre";

  if (includesAny(s, ["fissure", "fendue", "craquelure", "crevasse", "crack"])) return "fissure";
  if (includesAny(s, ["infiltration", "fuite", "infiltre", "leak"])) return "infiltration";
  if (includesAny(s, ["humidite", "humide", "moite", "condensation", "mouille"])) return "humidite";
  if (includesAny(s, ["isolation", "isolant", "laine", "ite", "interieur"])) return "isolation";
  if (includesAny(s, ["pont thermique", "pont_thermique", "pont-thermique", "deperdition"])) return "pont_thermique";
  if (includesAny(s, ["menuiserie", "fenetre", "baie", "ouvrant", "chassis", "volet"])) return "menuiserie";
  if (includesAny(s, ["toiture", "tuile", "ardoise", "faitage", "zinguerie", "velux", "charpente"])) return "toiture";
  if (includesAny(s, ["moisissure", "mould", "mold", "champignon"])) return "moisissure";
  if (includesAny(s, ["structure", "porteur", "linteau", "poutre", "hourdis", "dalle"])) return "structure";
  if (includesAny(s, ["electrique", "prise", "cable", "tableau", "disjoncteur"])) return "electrique";
  if (includesAny(s, ["plomberie", "canalisation", "tuyau", "evier", "evacuation", "siphon"])) return "plomberie";
  if (includesAny(s, ["vegetation", "lierre", "racine", "plante", "mousse"])) return "vegetation";

  return "autre";
}

export function colorFor(params: { type?: string; label?: string; color?: string }): string {
  if (params.color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(params.color.trim())) {
    return params.color.trim();
  }
  const typeNorm = (params.type || "").toLowerCase().replace(/\s+/g, "_") as AnomalyType;
  if (typeNorm && ANOMALY_COLORS[typeNorm]) {
    return ANOMALY_COLORS[typeNorm];
  }
  const g = guessType(params.label);
  return ANOMALY_COLORS[g];
}

export function titleForType(t: AnomalyType): string {
  const map: Record<AnomalyType, string> = {
    fissure: "Fissure",
    infiltration: "Infiltration",
    humidite: "Humidité",
    isolation: "Isolation",
    pont_thermique: "Pont thermique",
    menuiserie: "Menuiserie",
    toiture: "Toiture",
    moisissure: "Moisissure",
    structure: "Structure",
    electrique: "Électrique",
    plomberie: "Plomberie",
    vegetation: "Végétation",
    autre: "Autre",
  };
  return map[t] || "Autre";
}