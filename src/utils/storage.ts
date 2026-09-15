import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/utils/upload";
import { parallelBatch } from "@/utils/concurrency";

export type ImageTag = string;

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
  inferenceResult?: {
    label: string;
    score: number;
    /** Vecteur de probabilités complet, indexé comme modelMeta.classesOrder. */
    probs?: number[];
  };
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
  tags: string[];
  latitude?: number | null;
  longitude?: number | null;
};

/** Horodatage numérique ; une date absente ou illisible passe en premier. */
function timeOf(iso?: string): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Message lisible pour n'importe quelle erreur. Les erreurs Supabase sont des
 * objets et non des instances d'Error : `e instanceof Error` les afficherait
 * sous la forme « [object Object] ».
 */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

// Map database project to frontend Project
function mapDbToProject(dbProj: any): Project {
  return {
    id: dbProj.id,
    title: dbProj.name,
    address: dbProj.location || "",
    type: dbProj.description || "",
    status: (dbProj.status as ProjectStatus) || "Brouillon",
    createdAt: dbProj.created_at,
    updatedAt: dbProj.updated_at,
    prompt: dbProj.prompt || "",
    templateId: dbProj.template_id,
    notes: dbProj.notes || "",
    images: (dbProj.inspections || []).map((ins: any) => ({
      id: ins.id,
      name: ins.name || "Image",
      size: ins.size || 0,
      type: ins.type || "image/jpeg",
      dataUrl: ins.image_url || "",
      createdAt: ins.created_at,
      tag: ins.status,
      inferenceResult: ins.detection_results?.onnx ? {
        label: ins.detection_results.onnx.label,
        score: ins.detection_results.onnx.score,
        probs: ins.detection_results.onnx.probs,
      } : undefined,
    }))
      // Les inspections sont relues sans ORDER BY, et chaque updateProject()
      // réécrit toutes les lignes : Postgres ne garantit alors aucun ordre.
      // Trier par date de création rend l'affichage stable, y compris pour des
      // photos envoyées en parallèle qui n'arrivent pas dans l'ordre choisi.
      .sort((a: ProjectImage, b: ProjectImage) => timeOf(a.createdAt) - timeOf(b.createdAt)),
    tags: Array.isArray(dbProj.tags) ? dbProj.tags : [],
    latitude: dbProj.latitude ?? null,
    longitude: dbProj.longitude ?? null,
  };
}

// Helper: get current user from cached session (no network call)
async function requireUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("User not authenticated");
  return session.user;
}

// Lightweight version for the projects list page — no inspections data loaded
export async function getProjectsList(): Promise<(Omit<Project, 'images'> & { imageCount: number })[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return [];

  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      inspections ( id )
    `)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error("Error fetching projects list:", error);
    return [];
  }

  return data.map((dbProj: any) => ({
    id: dbProj.id,
    title: dbProj.name,
    address: dbProj.location || "",
    type: dbProj.description || "",
    status: (dbProj.status as ProjectStatus) || "Brouillon",
    createdAt: dbProj.created_at,
    updatedAt: dbProj.updated_at,
    prompt: dbProj.prompt || "",
    templateId: dbProj.template_id,
    notes: dbProj.notes || "",
    tags: Array.isArray(dbProj.tags) ? dbProj.tags : [],
    latitude: dbProj.latitude ?? null,
    longitude: dbProj.longitude ?? null,
    imageCount: (dbProj.inspections || []).length,
  }));
}

// Helper to upload image to Supabase Storage and create inspection record
async function uploadAndRecordImage(projectId: string, image: ProjectImage): Promise<string> {
  const user = await requireUser();

  let imageUrl = image.dataUrl;

  // If it's a dataUrl (new image), upload it to Storage
  if (image.dataUrl.startsWith('data:')) {
    const response = await fetch(image.dataUrl);
    const blob = await response.blob();
    const ext = blob.type.split('/')[1] || 'jpg';
    const fileName = `${user.id}/${projectId}/${image.id}.${ext}`;
    
    // Use shared upload utility
    try {
      imageUrl = await uploadFile(blob, 'inspections', fileName);
    } catch (e) {
      console.error("Storage upload error:", e);
      // Fallback: keep dataUrl if upload fails? Or throw?
      // Throwing might break the loop in updateProject, but maybe better to know.
      // But for resilience, we might keep local URL if upload fails temporarily?
      // No, let's stick to the URL returned or fail.
      throw e;
    }
  }

  // Create or update inspection record
  // We include inferenceResult in detection_results if it exists
  const detection_results: any = {};
  if (image.inferenceResult) {
    detection_results.onnx = {
      label: image.inferenceResult.label,
      score: image.inferenceResult.score,
      probs: image.inferenceResult.probs,
      timestamp: new Date().toISOString()
    };
  }

  const { data, error } = await supabase
    .from('inspections')
    .upsert({
      id: image.id,
      project_id: projectId,
      user_id: user.id,
      image_url: imageUrl,
      name: image.name,
      size: image.size,
      type: image.type,
      status: image.tag,
      created_at: image.createdAt,
      detection_results: Object.keys(detection_results).length > 0 ? detection_results : undefined
    })
    .select()
    .single();

  if (error) throw error;
  return data.image_url;
}

export async function getProjects(): Promise<Project[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return [];

  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      inspections (*)
    `)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error("Error fetching projects:", error);
    return [];
  }

  return data.map(mapDbToProject);
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      inspections (*)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error("Error fetching project:", error);
    return undefined;
  }

  return mapDbToProject(data);
}

export async function createProject(input: {
  title: string;
  address?: string;
  type?: string;
}): Promise<Project> {
  const user = await requireUser();

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: input.title.trim(),
      location: input.address?.trim(),
      description: input.type?.trim(),
      status: 'Brouillon',
      tags: [],
    })
    .select()
    .single();

  if (error) throw error;
  return mapDbToProject({ ...data, inspections: [] });
}

export type ImageUploadFailure = { name: string; message: string };

/** Envois simultanés : assez pour gagner du temps, sans rafale vers Storage. */
const UPLOAD_CONCURRENCY = 4;

/**
 * Ajoute des images à un projet, chacune pour son compte.
 *
 * Passer par updateProject() pour un import posait trois problèmes. Les
 * photos partaient une par une. La première erreur interrompait la boucle et
 * abandonnait les suivantes. Et cette erreur n'était interceptée nulle part :
 * rien ne s'affichait, l'application semblait figée. En prime, chaque import
 * réécrivait toutes les photos déjà présentes.
 *
 * Ici chaque image est envoyée et enregistrée indépendamment, en parallèle.
 * Les échecs sont retournés au lieu d'être levés, et seules les nouvelles
 * images sont touchées.
 */
export async function addImagesToProject(
  projectId: string,
  images: ProjectImage[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ added: number; failed: ImageUploadFailure[] }> {
  let done = 0;

  const results = await parallelBatch(
    images,
    async (img): Promise<ImageUploadFailure | null> => {
      try {
        await uploadAndRecordImage(projectId, img);
        return null;
      } catch (e) {
        console.error("[addImagesToProject] Échec pour", img.name, e);
        return { name: img.name, message: errorMessage(e) };
      } finally {
        done++;
        onProgress?.(done, images.length);
      }
    },
    UPLOAD_CONCURRENCY,
  );

  const failed = results.filter((r): r is ImageUploadFailure => r !== null);

  // Conserver le projet en tête de liste, comme le faisait updateProject().
  if (failed.length < images.length) {
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  return { added: images.length - failed.length, failed };
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, "id" | "createdAt">>,
): Promise<Project | undefined> {
  const user = await requireUser();

  const updateData: any = {};
  if (patch.title) updateData.name = patch.title;
  if (patch.address !== undefined) updateData.location = patch.address;
  if (patch.type !== undefined) updateData.description = patch.type;
  if (patch.status) updateData.status = patch.status;
  if (patch.templateId !== undefined) updateData.template_id = patch.templateId;
  if (patch.prompt !== undefined) updateData.prompt = patch.prompt;
  if (patch.notes !== undefined) updateData.notes = patch.notes;
  if (patch.tags !== undefined) updateData.tags = patch.tags;
  if (patch.latitude !== undefined) updateData.latitude = patch.latitude;
  if (patch.longitude !== undefined) updateData.longitude = patch.longitude;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;

  // Handle images update
  if (patch.images) {
    // 1. Get current images to handle deletions and detect changes
    const { data: currentInspections } = await supabase
      .from('inspections')
      .select('id, image_url')
      .eq('project_id', id);

    const currentMap = new Map((currentInspections || []).map(ins => [ins.id, ins.image_url]));
    const newIds = new Set(patch.images.map(img => img.id));

    // 2. Delete removed images
    const toDelete = (currentInspections || []).filter(ins => !newIds.has(ins.id));
    for (const ins of toDelete) {
      await supabase.from('inspections').delete().eq('id', ins.id);
    }

    // 3. Upload/Update images — only upload new ones (dataUrl starts with 'data:')
    for (const img of patch.images) {
      const existingUrl = currentMap.get(img.id);
      // If the image already exists in DB and its dataUrl is NOT a new data: blob, skip re-upload
      if (existingUrl && !img.dataUrl.startsWith('data:')) {
        // Only update metadata (tag, name, inferenceResult, etc.) without re-uploading
        const detection_results: any = {};
        if (img.inferenceResult) {
          detection_results.onnx = {
            label: img.inferenceResult.label,
            score: img.inferenceResult.score,
            probs: img.inferenceResult.probs,
            timestamp: new Date().toISOString()
          };
        }
        await supabase
          .from('inspections')
          .update({
            name: img.name,
            status: img.tag,
            detection_results: Object.keys(detection_results).length > 0 ? detection_results : undefined,
          })
          .eq('id', img.id);
      } else {
        // New image or re-upload needed
        await uploadAndRecordImage(id, img);
      }
    }
  }

  return getProjectById(id);
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de fichier échouée"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}