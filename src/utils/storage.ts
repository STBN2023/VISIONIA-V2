export type ImageTag =
  | "façade-N"
  | "façade-S"
  | "façade-E"
  | "façade-O"
  | "toiture"
  | "menuiseries"
  | "réseaux"
  | "pathologies"
  | "autre";

export type ProjectStatus = "Brouillon" | "En cours" | "Terminé" | "Archivé";

export type ProjectImage = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  createdAt: string;
  tag?: ImageTag;
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
};

// --- Stockage 100% local (navigateur) ---
const LOCAL_KEY = "projects_local_fallback_v1";

function readLocal(): Project[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Project[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(projects: Project[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
}

function findLocal(id: string): Project | undefined {
  return readLocal().find((p) => p.id === id);
}

function touchUpdatedAt(p: Project): Project {
  return { ...p, updatedAt: new Date().toISOString() };
}

// --- API locale ---
export async function getProjects(): Promise<Project[]> {
  // Tri par updatedAt desc
  return readLocal().sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  return findLocal(id);
}

export async function createProject(input: {
  title: string;
  address?: string;
  type?: string;
}): Promise<Project> {
  const now = new Date().toISOString();
  const proj: Project = {
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
  };
  const all = readLocal();
  writeLocal([proj, ...all]);
  return proj;
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, "id" | "createdAt">>,
): Promise<Project | undefined> {
  const all = readLocal();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  const prev = all[idx];
  const next = touchUpdatedAt({
    ...prev,
    ...patch,
  });
  all[idx] = next;
  writeLocal(all);
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  const all = readLocal().filter((p) => p.id !== id);
  writeLocal(all);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de fichier échouée"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}