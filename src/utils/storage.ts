import { idbSet, idbGet, idbDel } from "@/utils/idb";

export type ImageTag = string; // tags libres

export type ProjectStatus = "Brouillon" | "En cours" | "Terminé" | "Archivé";

export type ProjectImage = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string; // Hydraté depuis IndexedDB côté lecture
  createdAt: string;
  tag?: ImageTag; // libre
  templateId?: string;
};

export type Project = {
  id: string;
  title: string;
  address?: string;
  type?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  prompt?: string;
  templateId?: string;
  images: ProjectImage[];
  notes?: string;
  tags: string[]; // tags définis au niveau projet
};

// --- Stockage 100% local (navigateur) ---
const LOCAL_KEY = "projects_local_fallback_v1";
const IDB_PREFIX = "image:";

type StoredImage = Omit<ProjectImage, "dataUrl"> & { dataUrl?: string }; // dataUrl remplacée par idb://id
type StoredProject = Omit<Project, "images"> & { images: StoredImage[] };

function readLocalRaw(): StoredProject[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr: any[] = Array.isArray(parsed) ? parsed : [];
    return arr.map((p) => ({
      ...p,
      tags: Array.isArray(p.tags) ? p.tags : [],
    })) as StoredProject[];
  } catch {
    return [];
  }
}

function writeLocalRaw(projects: StoredProject[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
}

function findLocalRaw(id: string): StoredProject | undefined {
  return readLocalRaw().find((p) => p.id === id);
}

function touchUpdatedAt<P extends { updatedAt: string }>(p: P): P {
  return { ...p, updatedAt: new Date().toISOString() };
}

// Remplace dataUrl volumineuse par un pointeur idb://<id> et sauvegarde la dataURL en IndexedDB
async function externalizeImage(img: ProjectImage | StoredImage): Promise<StoredImage> {
  const id = img.id || crypto.randomUUID();
  const pointer = `idb://${id}`;
  const hasData = typeof (img as any).dataUrl === "string" && (img as any).dataUrl.startsWith("data:");
  if (hasData) {
    await idbSet(IDB_PREFIX + id, (img as any).dataUrl as string);
  }
  return {
    ...(img as any),
    id,
    dataUrl: pointer, // petite string
  };
}

// Hydrate la dataUrl depuis IndexedDB si besoin
async function hydrateImage(img: StoredImage): Promise<ProjectImage> {
  const isPointer = typeof img.dataUrl === "string" && img.dataUrl.startsWith("idb://");
  if (isPointer) {
    const id = img.id;
    const data = await idbGet(IDB_PREFIX + id);
    return {
      ...(img as any),
      dataUrl: data || "", // on laisse vide si non trouvé
    };
  }
  return img as ProjectImage;
}

export async function getProjects(): Promise<Project[]> {
  // Pas besoin d’hydrater les dataURL pour la liste
  return (readLocalRaw() as StoredProject[])
    .map((p) => ({
      ...(p as any),
      images: (p.images || []).map((i) => ({ ...(i as any), dataUrl: i.dataUrl ?? `idb://${i.id}` })),
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) as Project[];
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const p = findLocalRaw(id);
  if (!p) return undefined;
  const hydrated = await Promise.all((p.images || []).map((i) => hydrateImage(i)));
  return { ...(p as any), images: hydrated } as Project;
}

export async function createProject(input: {
  title: string;
  address?: string;
  type?: string;
}): Promise<Project> {
  const now = new Date().toISOString();
  const proj: StoredProject = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    address: input.address?.trim() || undefined,
    type: input.type?.trim() || undefined,
    status: "Brouillon",
    createdAt: now,
    updatedAt: now,
    prompt: "",
    templateId: undefined,
    images: [],
    notes: undefined,
    tags: [],
  };
  const all = readLocalRaw();
  writeLocalRaw([proj, ...all]);
  return proj as unknown as Project;
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, "id" | "createdAt">>,
): Promise<Project | undefined> {
  const all = readLocalRaw();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  const prev = all[idx];

  let nextImages: StoredImage[] | undefined = undefined;

  if (Array.isArray(patch.images)) {
    // Externaliser uniquement les nouvelles images et éviter de réécrire celles déjà stockées
    const incoming = patch.images as ProjectImage[];
    const prevById = new Map((prev.images || []).map((i) => [i.id, i]));
    const incomingIds = new Set(incoming.map((i) => i.id));
    const prevIds = new Set((prev.images || []).map((i) => i.id));

    // Supprimer de l'IDB les images disparues
    for (const oldId of prevIds) {
      if (!incomingIds.has(oldId)) {
        await idbDel(IDB_PREFIX + oldId);
      }
    }

    nextImages = [];
    for (const img of incoming) {
      if (prevById.has(img.id)) {
        // Image déjà connue: on conserve le pointeur IDB et on met à jour les métadonnées
        const prevStored = prevById.get(img.id)!;
        const { dataUrl: _ignored, ...rest } = img as any;
        nextImages.push({
          ...(prevStored as any),
          ...rest,
          dataUrl: prevStored.dataUrl ?? `idb://${img.id}`,
        });
      } else {
        // Nouvelle image: externaliser (sauver dataUrl en IDB et stocker un pointeur)
        const stored = await externalizeImage(img);
        nextImages.push(stored);
      }
    }
  }

  const next: StoredProject = touchUpdatedAt({
    ...(prev as any),
    ...patch,
    // sécurité: ensure tags array
    tags: Array.isArray(patch.tags) ? patch.tags : prev.tags,
    images: nextImages !== undefined ? nextImages : prev.images,
  });

  all[idx] = next;
  writeLocalRaw(all);

  // Retourner le projet hydraté
  const hydrated = await Promise.all((next.images || []).map((i) => hydrateImage(i)));
  return { ...(next as any), images: hydrated } as Project;
}

export async function deleteProject(id: string): Promise<void> {
  // Supprimer d'abord les dataURL IDB des images du projet
  const prev = findLocalRaw(id);
  if (prev) {
    for (const i of prev.images || []) {
      await idbDel(IDB_PREFIX + i.id);
    }
  }
  const next = readLocalRaw().filter((p) => p.id !== id);
  writeLocalRaw(next);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de fichier échouée"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}