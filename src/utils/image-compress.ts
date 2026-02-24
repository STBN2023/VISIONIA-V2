export type CompressOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0..1
  convertTo?: "image/webp" | "image/jpeg";
};

const supportsCreateImageBitmap = typeof createImageBitmap === "function";

/**
 * Charge une image à partir d'un blob en ImageBitmap ou HTMLImageElement.
 */
async function loadImageFromBlob(blob: Blob): Promise<{ bitmap?: ImageBitmap; image?: HTMLImageElement; width: number; height: number }> {
  if (supportsCreateImageBitmap) {
    const bm = await createImageBitmap(blob);
    return { bitmap: bm, width: bm.width, height: bm.height };
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = url;
    });
    return { image: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Dessine la source sur un canvas aux dimensions indiquées.
 */
function drawToCanvas(
  source: { bitmap?: ImageBitmap; image?: HTMLImageElement },
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas {
  const useOffscreen = typeof OffscreenCanvas !== "undefined";
  const canvas = useOffscreen ? new OffscreenCanvas(width, height) : (document.createElement("canvas") as HTMLCanvasElement);
  if (!useOffscreen) {
    (canvas as HTMLCanvasElement).width = width;
    (canvas as HTMLCanvasElement).height = height;
  }
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Context 2D non disponible");
  if (source.bitmap) {
    ctx.drawImage(source.bitmap, 0, 0, width, height);
  } else if (source.image) {
    ctx.drawImage(source.image, 0, 0, width, height);
  } else {
    throw new Error("Source image invalide");
  }
  return canvas;
}

/**
 * Exporte un canvas en Blob avec le mime/type et la qualité donnés.
 */
function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas && typeof (canvas as OffscreenCanvas).convertToBlob === "function") {
    return (canvas as OffscreenCanvas).convertToBlob({ type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((b) => {
      if (!b) reject(new Error("Echec toBlob"));
      else resolve(b);
    }, type, quality);
  });
}

/**
 * Compresse une image (File) en Blob, avec redimensionnement si nécessaire.
 * - maxWidth/maxHeight défaut: 2000
 * - qualité défaut: 0.82
 * - convertTo défaut: image/webp
 */
export async function compressImageToBlob(file: File, options: CompressOptions = {}): Promise<Blob> {
  const {
    maxWidth = 2000,
    maxHeight = 2000,
    quality = 0.82,
    convertTo = "image/webp",
  } = options;

  const srcBlob = file;
  const { bitmap, image, width, height } = await loadImageFromBlob(srcBlob);

  // Calcule dimensions finales
  let targetW = width;
  let targetH = height;
  const ratio = width / height;

  if (targetW > maxWidth) {
    targetW = maxWidth;
    targetH = Math.round(maxWidth / ratio);
  }
  if (targetH > maxHeight) {
    targetH = maxHeight;
    targetW = Math.round(maxHeight * ratio);
  }

  const canvas = drawToCanvas({ bitmap, image }, targetW, targetH);

  // Choisit le format de sortie: webp de préférence, sinon jpeg
  const outType = convertTo || (file.type === "image/png" || file.type === "image/webp" ? "image/webp" : "image/jpeg");
  const outQuality = Math.max(0.5, Math.min(quality, 0.95));

  const outBlob = await canvasToBlob(canvas, outType, outQuality);

  // Nettoyage ImageBitmap si utilisé
  if (bitmap && "close" in bitmap) {
    try {
      bitmap.close();
    } catch {
      // ignore
    }
  }

  return outBlob;
}

/**
 * Convertit un Blob en data URL.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Lecture blob échouée"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(blob);
  });
}