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

// --- Fallback local (navigateur) ---
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

// --- API + fallback ---
export async function getProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (res.ok) {
    const data = (await res.json()) as Project[];
    return data;
  }
  // Fallback
  console.warn("API /api/projects indisponible, utilisation du stockage local.");
  return readLocal();
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const res = await fetch(`/api/projects/${id}`);
  if (res.status === 404) return undefined;
  if (res.ok) {
    return (await res.json()) as Project;
  }
  // Fallback
  console.warn(`API /api/projects/${id} indisponible, lecture locale.`);
  return findLocal(id);
}

export async function createProject(input: {
  title: string;
  address?: string;
  type?: string;
}): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) {
    return (await res.json()) as Project;
  }
  // Fallback local
  console.warn("API /api/projects POST indisponible, création en localStorage.");
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
  const res = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.status === 404) return undefined;
  if (res.ok) {
    return (await res.json()) as Project;
  }
  // Fallback local
  console.warn(`API /api/projects/${id} PATCH indisponible, mise à jour locale.`);
  const all = readLocal();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  const prev = all[idx];
  const next: Project = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = next;
  writeLocal(all);
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (res.ok) return;
  // Fallback local
  console.warn(`API /api/projects/${id} DELETE indisponible, suppression locale.`);
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