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

export async function getProjects(): Promise<Project[]>{ 
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error(`Erreur chargement projets (${res.status})`);
  const data = (await res.json()) as Project[];
  return data;
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const res = await fetch(`/api/projects/${id}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Erreur chargement projet (${res.status})`);
  return (await res.json()) as Project;
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
  if (!res.ok) throw new Error(`Erreur création projet (${res.status})`);
  return (await res.json()) as Project;
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
  if (!res.ok) throw new Error(`Erreur mise à jour projet (${res.status})`);
  return (await res.json()) as Project;
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Erreur suppression projet (${res.status})`);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de fichier échouée"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}