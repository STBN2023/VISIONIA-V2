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
  images: ProjectImage[];
  notes?: string;
};

const STORAGE_KEY = "projects";

function readAll(): Project[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Project[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function getProjects(): Project[] {
  return readAll().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getProjectById(id: string): Project | undefined {
  return readAll().find((p) => p.id === id);
}

export function createProject(input: {
  title: string;
  address?: string;
  type?: string;
}): Project {
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    address: input.address?.trim(),
    type: input.type?.trim(),
    status: "Brouillon",
    createdAt: now,
    updatedAt: now,
    prompt: "",
    images: [],
  };
  const all = readAll();
  all.push(project);
  writeAll(all);
  return project;
}

export function updateProject(
  id: string,
  patch: Partial<Omit<Project, "id" | "createdAt">>,
): Project | undefined {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  const updated: Project = {
    ...all[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

export function deleteProject(id: string) {
  const all = readAll().filter((p) => p.id !== id);
  writeAll(all);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de fichier échouée"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}