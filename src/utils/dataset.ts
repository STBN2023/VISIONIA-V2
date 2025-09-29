import JSZip from "jszip";
import { idbSet, idbGet, idbDel } from "@/utils/idb";
import { saveSettings, getSettings, type APISettings } from "@/utils/settings";
import { blobToDataUrl } from "@/utils/image-compress";

export type DatasetSplit = "train" | "val" | "test";

export type DatasetEntry = {
  id: string;
  className: string;
  fileName: string;
  size: number;
  mime: string;
  blobKey: string; // clé IDB: dataset:image:<id>
  split: DatasetSplit;
};

export type DatasetManifest = {
  id: string;
  name: string;
  createdAt: string;
  classes: string[];
  splits: {
    train: DatasetEntry[];
    val: DatasetEntry[];
    test: DatasetEntry[];
  };
  stats: {
    train: Record<string, number>;
    val: Record<string, number>;
    test: Record<string, number>;
    total: Record<string, number>;
  };
};

const MANIFEST_PREFIX = "dataset:manifest:";
const IMAGE_PREFIX = "dataset:image:";
const MODEL_PREFIX = "dataset:model:";

function isImagePath(p: string): boolean {
  const lower = p.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  );
}

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function findSplitInPath(parts: string[]): { split?: DatasetSplit; idx: number } {
  const splits: DatasetSplit[] = ["train", "val", "test"];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toLowerCase();
    if (splits.includes(p as DatasetSplit)) {
      return { split: p as DatasetSplit, idx: i };
    }
  }
  return { split: undefined, idx: -1 };
}

function emptyStats(classes: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  classes.forEach((c) => (m[c] = 0));
  return m;
}

export async function importDatasetFromZip(file: File, name?: string): Promise<DatasetManifest> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((f) => !f.dir && isImagePath(f.name));
  if (entries.length === 0) {
    throw new Error("Aucune image valide trouvée dans l'archive (.jpg/.jpeg/.png/.webp).");
  }

  // Collecte provisoire classNames par split
  const tmp: { train: DatasetEntry[]; val: DatasetEntry[]; test: DatasetEntry[] } = {
    train: [],
    val: [],
    test: [],
  };
  const classesSet = new Set<string>();

  for (const f of entries) {
    const parts = f.name.split("/").filter(Boolean);
    const { split, idx } = findSplitInPath(parts);
    if (!split) continue; // ignorer les fichiers hors train/val/test
    const className = parts[idx + 1];
    const fileName = parts[parts.length - 1];
    if (!className || !fileName) continue;

    const blob = await f.async("blob");
    const dataUrl = await blobToDataUrl(blob);
    const id = crypto.randomUUID();
    const blobKey = IMAGE_PREFIX + id;

    await idbSet(blobKey, dataUrl);

    const entry: DatasetEntry = {
      id,
      className,
      fileName,
      size: blob.size,
      mime: guessMime(fileName),
      blobKey,
      split,
    };
    tmp[split].push(entry);
    classesSet.add(className);
  }

  if (tmp.train.length + tmp.val.length + tmp.test.length === 0) {
    throw new Error("Aucune image train/val/test détectée. Vérifiez la structure: train/<classe>/..., val/<classe>/..., test/<classe>/...");
  }

  // Tri pour stabilité
  const classes = Array.from(classesSet).sort((a, b) => a.localeCompare(b));

  // Stats
  const stats = {
    train: emptyStats(classes),
    val: emptyStats(classes),
    test: emptyStats(classes),
    total: emptyStats(classes),
  };
  for (const e of tmp.train) {
    stats.train[e.className] = (stats.train[e.className] || 0) + 1;
    stats.total[e.className] = (stats.total[e.className] || 0) + 1;
  }
  for (const e of tmp.val) {
    stats.val[e.className] = (stats.val[e.className] || 0) + 1;
    stats.total[e.className] = (stats.total[e.className] || 0) + 1;
  }
  for (const e of tmp.test) {
    stats.test[e.className] = (stats.test[e.className] || 0) + 1;
    stats.total[e.className] = (stats.total[e.className] || 0) + 1;
  }

  const manifest: DatasetManifest = {
    id: crypto.randomUUID(),
    name: name?.trim() || file.name.replace(/\.zip$/i, ""),
    createdAt: new Date().toISOString(),
    classes,
    splits: {
      train: tmp.train,
      val: tmp.val,
      test: tmp.test,
    },
    stats,
  };

  await idbSet(MANIFEST_PREFIX + manifest.id, JSON.stringify(manifest));

  // Mémoriser la référence dataset dans les settings
  const s = getSettings();
  const next: Partial<APISettings> = {
    datasetRef: { datasetId: manifest.id, datasetName: manifest.name },
    classesDetected: {
      unionClasses: classes,
      perSplitClasses: {
        train: Array.from(new Set(tmp.train.map((e) => e.className))).sort(),
        val: Array.from(new Set(tmp.val.map((e) => e.className))).sort(),
        test: Array.from(new Set(tmp.test.map((e) => e.className))).sort(),
      },
    },
  };
  saveSettings(next);

  return manifest;
}

export async function getDatasetManifest(id: string): Promise<DatasetManifest | undefined> {
  const raw = await idbGet(MANIFEST_PREFIX + id);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as DatasetManifest;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function deleteDataset(datasetId: string): Promise<void> {
  const manifest = await getDatasetManifest(datasetId);
  if (manifest) {
    const allEntries = [...manifest.splits.train, ...manifest.splits.val, ...manifest.splits.test];
    for (const e of allEntries) {
      await idbDel(e.blobKey);
    }
    await idbDel(MANIFEST_PREFIX + datasetId);
  }
  // Nettoyer les settings liés
  saveSettings({
    datasetRef: undefined,
    classesDetected: undefined,
  });
}

export async function storeOnnxModelToIdb(file: File): Promise<{ modelId: string }> {
  const ab = await file.arrayBuffer();
  // Stockage en base64 data URL pour compatibilité avec idbSet (string)
  const base64 = arrayBufferToBase64(ab);
  const dataUrl = `data:application/octet-stream;base64,${base64}`;
  const modelId = crypto.randomUUID();
  await idbSet(MODEL_PREFIX + modelId, dataUrl);

  // Mettre à jour settings
  saveSettings({
    modelRef: { source: "idb", value: modelId },
  });

  return { modelId };
}

export async function deleteOnnxModel(modelId: string): Promise<void> {
  await idbDel(MODEL_PREFIX + modelId);
  saveSettings({
    modelRef: undefined,
    modelMeta: undefined,
  });
}

export function getImageDataUrlKey(entry: DatasetEntry): string {
  return entry.blobKey; // clé IndexedDB
}

// utils internes
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa peut throw si trop gros, mais en pratique ça passe pour ~10-20 Mo
  return btoa(binary);
}

// Recalcule classes + stats à partir du manifest courant
function recalcStatsAndClasses(manifest: DatasetManifest) {
  const allEntries = [
    ...manifest.splits.train,
    ...manifest.splits.val,
    ...manifest.splits.test,
  ];
  const classes = Array.from(new Set(allEntries.map((e) => e.className))).sort((a, b) =>
    a.localeCompare(b),
  );

  const stats = {
    train: emptyStats(classes),
    val: emptyStats(classes),
    test: emptyStats(classes),
    total: emptyStats(classes),
  };

  for (const e of manifest.splits.train) {
    stats.train[e.className] = (stats.train[e.className] || 0) + 1;
    stats.total[e.className] = (stats.total[e.className] || 0) + 1;
  }
  for (const e of manifest.splits.val) {
    stats.val[e.className] = (stats.val[e.className] || 0) + 1;
    stats.total[e.className] = (stats.total[e.className] || 0) + 1;
  }
  for (const e of manifest.splits.test) {
    stats.test[e.className] = (stats.test[e.className] || 0) + 1;
    stats.total[e.className] = (stats.total[e.className] || 0) + 1;
  }

  manifest.classes = classes;
  manifest.stats = stats;
}

// Met à jour une ou plusieurs entrées (classe et/ou split), puis sauvegarde le manifest et les settings liés
export async function updateDatasetEntries(
  datasetId: string,
  updates: Array<{ id: string; className?: string; split?: DatasetSplit }>
): Promise<DatasetManifest> {
  const manifest = await getDatasetManifest(datasetId);
  if (!manifest) {
    throw new Error("Dataset introuvable.");
  }

  // index rapide: imageID -> [splitName, index]
  const locate = (id: string): { split: DatasetSplit; index: number } | null => {
    const { train, val, test } = manifest.splits;
    let idx = train.findIndex((e) => e.id === id);
    if (idx >= 0) return { split: "train", index: idx };
    idx = val.findIndex((e) => e.id === id);
    if (idx >= 0) return { split: "val", index: idx };
    idx = test.findIndex((e) => e.id === id);
    if (idx >= 0) return { split: "test", index: idx };
    return null;
  };

  for (const u of updates) {
    const pos = locate(u.id);
    if (!pos) continue;
    const fromArr = manifest.splits[pos.split];

    const entry = { ...fromArr[pos.index] };
    if (typeof u.className === "string" && u.className.trim()) {
      entry.className = u.className.trim();
    }

    const toSplit = u.split ?? pos.split;
    if (toSplit !== pos.split) {
      // déplacer vers l'autre split
      fromArr.splice(pos.index, 1);
      manifest.splits[toSplit].push(entry);
    } else {
      // patch in-place
      fromArr[pos.index] = entry;
    }
  }

  // Recalculer classes + stats
  recalcStatsAndClasses(manifest);

  // Sauvegarde manifest
  await idbSet(MANIFEST_PREFIX + manifest.id, JSON.stringify(manifest));

  // Mettre à jour settings dérivés (classesDetected)
  const nextClassesDetected = {
    unionClasses: manifest.classes,
    perSplitClasses: {
      train: Array.from(new Set(manifest.splits.train.map((e) => e.className))).sort(),
      val: Array.from(new Set(manifest.splits.val.map((e) => e.className))).sort(),
      test: Array.from(new Set(manifest.splits.test.map((e) => e.className))).sort(),
    },
  };

  saveSettings({
    classesDetected: nextClassesDetected,
    datasetRef: { datasetId: manifest.id, datasetName: manifest.name },
  });

  return manifest;
}