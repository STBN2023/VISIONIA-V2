import { supabase } from "@/integrations/supabase/client";

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
};

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
        score: ins.detection_results.onnx.score
      } : undefined,
    })),
    tags: dbProj.tags || [],
  };
}

// Helper to upload image to Supabase Storage and create inspection record
async function uploadAndRecordImage(projectId: string, image: ProjectImage): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  let imageUrl = image.dataUrl;

  // If it's a dataUrl (new image), upload it to Storage
  if (image.dataUrl.startsWith('data:')) {
    const response = await fetch(image.dataUrl);
    const blob = await response.blob();
    const fileName = `${user.id}/${projectId}/${image.id}.${blob.type.split('/')[1]}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('inspections')
      .upload(fileName, blob, {
        upsert: true,
        contentType: blob.type
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
    } else {
      const { data: { publicUrl } } = supabase.storage
        .from('inspections')
        .getPublicUrl(fileName);
      imageUrl = publicUrl;
    }
  }

  // Create or update inspection record
  // We include inferenceResult in detection_results if it exists
  const detection_results: any = {};
  if (image.inferenceResult) {
    detection_results.onnx = {
      label: image.inferenceResult.label,
      score: image.inferenceResult.score,
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: input.title.trim(),
      location: input.address?.trim(),
      description: input.type?.trim(),
      status: 'Brouillon'
    })
    .select()
    .single();

  if (error) throw error;
  return mapDbToProject({ ...data, inspections: [] });
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, "id" | "createdAt">>,
): Promise<Project | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const updateData: any = {};
  if (patch.title) updateData.name = patch.title;
  if (patch.address !== undefined) updateData.location = patch.address;
  if (patch.type !== undefined) updateData.description = patch.type;
  if (patch.status) updateData.status = patch.status;
  if (patch.templateId !== undefined) updateData.template_id = patch.templateId;
  if (patch.prompt !== undefined) updateData.prompt = patch.prompt;
  if (patch.notes !== undefined) updateData.notes = patch.notes;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;

  // Handle images update
  if (patch.images) {
    // 1. Get current images to handle deletions
    const { data: currentInspections } = await supabase
      .from('inspections')
      .select('id, image_url')
      .eq('project_id', id);

    const currentIds = new Set((currentInspections || []).map(ins => ins.id));
    const newIds = new Set(patch.images.map(img => img.id));

    // 2. Delete removed images
    const toDelete = (currentInspections || []).filter(ins => !newIds.has(ins.id));
    for (const ins of toDelete) {
      await supabase.from('inspections').delete().eq('id', ins.id);
      // Optional: Delete from Storage too if needed
    }

    // 3. Upload/Update images
    for (const img of patch.images) {
      await uploadAndRecordImage(id, img);
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