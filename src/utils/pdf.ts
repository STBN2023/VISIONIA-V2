import { jsPDF } from "jspdf";
import type { Run } from "@/utils/runs";
import type { ProjectImage } from "@/utils/storage";

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 6) {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function getMimeFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);base64,/);
  return m ? m[1] : "";
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

async function toJpegDataUrl(dataUrl: string, quality = 0.9): Promise<string> {
  const mime = getMimeFromDataUrl(dataUrl);
  if (mime === "image/jpeg" || mime === "image/jpg") return dataUrl;
  if (mime === "image/png") return dataUrl; // jsPDF sait gérer PNG directement
  // Convertit tout le reste (ex: webp) en JPEG via canvas
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context indisponible");
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", Math.max(0.6, Math.min(quality, 0.95)));
}

async function addImageBlock(doc: jsPDF, dataUrl: string, x: number, y: number, maxWidth: number, maxHeight: number): Promise<number> {
  const mime = getMimeFromDataUrl(dataUrl);
  const isPng = mime === "image/png";
  const needsConvert = !(mime === "image/jpeg" || mime === "image/jpg" || isPng);

  const usableUrl = needsConvert ? await toJpegDataUrl(dataUrl) : dataUrl;
  const img = await loadImage(usableUrl);

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  // Échelle pour tenir dans la zone
  const scale = Math.min(maxWidth / iw, maxHeight / ih, 1);
  const w = Math.max(10, Math.round(iw * scale));
  const h = Math.max(10, Math.round(ih * scale));

  // Saut de page si nécessaire
  if (y + h > 280) {
    doc.addPage();
    y = 20;
  }

  const format = isPng ? "PNG" : "JPEG";
  doc.addImage(usableUrl, format as any, x, y, w, h);
  return y + h;
}

export async function exportRunToPdf(run: Run, images: ProjectImage[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const contentWidth = 210 - margin * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Rapport d'analyse - ISOEDRE Vision IA", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const meta = `Run: ${run.id} • Projet: ${run.projectId} • Mode: ${run.mode} • Statut: ${run.status} • Créé: ${new Date(
    run.createdAt,
  ).toLocaleString()}`;
  let y = addWrappedText(doc, meta, margin, 26, contentWidth, 5);

  y += 4;
  doc.setDrawColor(180);
  doc.line(margin, y, margin + contentWidth, y);
  y += 8;

  if (run.mode === "aggregate") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Rapport agrégé", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const text = run.outputText?.trim() || "Aucun contenu disponible (run non terminé).";
    y = addWrappedText(doc, text, margin, y, contentWidth, 6);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Rapports par image", margin, y);
    y += 8;

    for (const item of run.items) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      const img = images.find((i) => i.id === item.imageId);
      const header = `Image: ${img?.name || item.imageId} ${img?.tag ? `(${img.tag})` : ""} • Statut: ${item.status}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      y = addWrappedText(doc, header, margin, y, contentWidth, 5);

      // Joindre la vignette de l'image avant le texte, si disponible
      if (img?.dataUrl) {
        // max 100mm large, 70mm haut
        y += 2;
        y = await addImageBlock(doc, img.dataUrl, margin, y, Math.min(contentWidth, 100), 70);
        y += 4;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const body = item.outputText?.trim() || (item.error ? `Erreur: ${item.error}` : "Pas de résultat disponible.");
      y = addWrappedText(doc, body, margin, y, contentWidth, 6);

      y += 6;
      doc.setDrawColor(220);
      doc.line(margin, y, margin + contentWidth, y);
      y += 6;
    }
  }

  const filename =
    run.mode === "aggregate"
      ? `run_${run.projectId}_${run.id}_aggregate.pdf`
      : `run_${run.projectId}_${run.id}_per_image.pdf`;
  doc.save(filename);
}