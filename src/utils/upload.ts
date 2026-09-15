import { supabase } from "@/integrations/supabase/client";

/**
 * Uploads a file to Supabase Storage and returns the public URL.
 * @param file The file or blob to upload
 * @param bucket The storage bucket name
 * @param path The file path within the bucket
 * @returns The public URL of the uploaded file
 */
export async function uploadFile(
  file: File | Blob,
  bucket: string,
  path: string
): Promise<string> {
  // Session en cache plutôt que getUser(), qui interroge le serveur d'auth :
  // appelé une fois par photo, il ajoutait un aller-retour réseau à chaque envoi.
  // Le stockage revalide de toute façon le jeton côté serveur.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error("Vous devez être connecté pour uploader des fichiers.");
  }

  // Determine content type
  const contentType = file.type || "application/octet-stream";

  // Upload
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: true,
      contentType,
    });

  if (uploadError) {
    throw new Error(`Erreur d'upload: ${uploadError.message}`);
  }

  // Get Public URL
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return publicUrl;
}

/**
 * Uploads a user asset (e.g. background image) to the 'assets' bucket.
 * Uses the user's ID as a folder prefix for organization.
 */
export async function uploadUserAsset(
  file: File | Blob,
  fileName: string
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("User not authenticated");

  // Ensure unique path: userId/fileName
  const path = `${session.user.id}/${fileName}`;
  return uploadFile(file, "assets", path);
}
