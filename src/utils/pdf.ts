import { jsPDF } from "jspdf";
import type { Run } from "@/utils/runs";
import type { ProjectImage } from "@/utils/storage";
import { getProjectById } from "@/utils/storage";

// Ajout: nettoyage Markdown -> texte simple
function stripMarkdown(input: string): string {
  let text = input || "";
  // Retirer fences ```... et lignes ```lang
  text = text.replace(/^```.*$/gm, "");
  // Retirer les # en début de ligne (titres)
  text = text.replace(/^[#]+\s*/gm, "");
  // Retirer puces en début de ligne (-, *, +)
  text = text.replace(/^[\-\*\+]\s+/gm, "");
  // Retirer emphases **bold**, __bold__, *italique*, _italique_
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  // Retirer code inline `code`
  text = text.replace(/`([^`]*)`/g, "$1");
  // Nettoyage espaces multiples et lignes vides répétées
  text = text.replace(/[ \t]+\n/g, "\n"); // espaces en fin de ligne
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// Ajout: traductions FR pour mode/statut
function toFrenchMode(mode: Run["mode"]): string {
  return mode === "aggregate" ? "agrégé" : "par image";
}
function toFrenchStatus(status: Run["status"]): string {
  switch (status) {
    case "succeeded":
      return "terminé";
    case "running":
      return "en cours";
    case "queued":
      return "en file d’attente";
    case "failed":
      return "échoué";
    default:
      return String(status);
  }
}

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
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context indisponible");
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", Math.max(0.6, Math.min(quality, 0.95)));
}

type PlacedImage = { x: number; y: number; w: number; h: number };

async function addImageBlock(doc: jsPDF, dataUrl: string, x: number, y: number, maxWidth: number, maxHeight: number): Promise<{ nextY: number; placed: PlacedImage }> {
  const mime = getMimeFromDataUrl(dataUrl);
  const isPng = mime === "image/png";
  const needsConvert = !(mime === "image/jpeg" || mime === "image/jpg" || isPng);

  const usableUrl = needsConvert ? await toJpegDataUrl(dataUrl) : dataUrl;
  const img = await loadImage(usableUrl);

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const scale = Math.min(maxWidth / iw, maxHeight / ih, 1);
  const w = Math.max(10, Math.round(iw * scale));
  const h = Math.max(10, Math.round(ih * scale));

  let drawY = y;
  if (drawY + h > 280) {
    doc.addPage();
    drawY = 20;
  }

  const format = isPng ? "PNG" : "JPEG";
  doc.addImage(usableUrl, format as any, x, drawY, w, h);
  return { nextY: drawY + h, placed: { x, y: drawY, w, h } };
}

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    return [r, g, b];
  }
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return [r, g, b];
}

function drawRotatedRect(doc: jsPDF, x: number, y: number, w: number, h: number, angleDeg: number, color: [number, number, number]) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = (angleDeg * Math.PI) / 180;

  const corners: [number, number][] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([dx, dy]) => {
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return [cx + rx, cy + ry];
  });

  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.8);
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % 4];
    doc.line(x1, y1, x2, y2);
  }
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

  // Remplacer l’ID du projet par son nom réel et traduire mode/statut
  const project = await getProjectById(run.projectId);
  const metaText = [
    `Run: ${run.id}`,
    `Projet: ${project?.title || "Sans titre"}`,
    `Mode: ${toFrenchMode(run.mode)}`,
    `Statut: ${toFrenchStatus(run.status)}`,
    `Créé: ${new Date(run.createdAt).toLocaleString()}`,
  ].join(" • ");

  // Encadrer l'en-tête dans un petit cartouche
  const metaLines = doc.splitTextToSize(metaText, contentWidth);
  let y = 26;
  const boxHeight = metaLines.length * 5 + 4;
  doc.setFillColor(245);
  // arrondis légers
  (doc as any).roundedRect(margin - 1, y - 5, contentWidth + 2, boxHeight, 2, 2, "F");
  y = addWrappedText(doc, metaText, margin, y, contentWidth, 5);

  y += 4;
  doc.setDrawColor(180);
  doc.line(margin, y, margin + contentWidth, y);
  y += 8;

  // Helper pour dessiner les boxes (orientées si angle)
  function drawBoxesOnPlaced(placed: PlacedImage, boxes: NonNullable<Run["items"][number]["boxes"]>) {
    boxes.forEach((b) => {
      const px = placed.x + b.x * placed.w;
      const py = placed.y + b.y * placed.h;
      const pw = b.w * placed.w;
      const ph = b.h * placed.h;

      let r = 34, g = 197, bcol = 94;
      const col = b.color || "#22C55E";
      try {
        const rgb = hexToRgb(col);
        r = rgb[0]; g = rgb[1]; bcol = rgb[2];
      } catch {
        // fallback
      }

      if (typeof b.angle === "number" && Math.abs(b.angle) > 0.01) {
        drawRotatedRect(doc, px, py, pw, ph, b.angle, [r, g, bcol]);
      } else {
        doc.setDrawColor(r, g, bcol);
        doc.setLineWidth(0.8);
        doc.rect(px, py, pw, ph);
      }

      if (b.label) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        // Place le label légèrement au-dessus du coin gauche
        doc.text(b.label, px + 1.5, Math.max(py - 1, 10));
      }
    });
  }

  if (run.mode === "aggregate") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Rapport agrégé", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const text = stripMarkdown(run.outputText?.trim() || "Aucun contenu disponible (run non terminé).");
    y = addWrappedText(doc, text, margin, y, contentWidth, 6);

    if (run.items && run.items.length > 0) {
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Détails par image", margin, y);
      y += 8;

      for (const item of run.items) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const img = images.find((i) => i.id === item.imageId);
        const header = `Image: ${img?.name || item.imageId} ${img?.tag ? `(${img.tag})` : ""}`;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        y = addWrappedText(doc, header, margin, y, contentWidth, 5);

        if (img?.dataUrl) {
          y += 2;
          const placedRes = await addImageBlock(doc, img.dataUrl, margin, y, Math.min(contentWidth, 100), 70);
          y = placedRes.nextY + 4;

          const boxes = item.boxes || [];
          if (boxes.length > 0) {
            drawBoxesOnPlaced(placedRes.placed, boxes);
          }
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const body = stripMarkdown(item.outputText?.trim() || (item.error ? `Erreur: ${item.error}` : "Pas de résultat disponible."));
        y = addWrappedText(doc, body, margin, y, contentWidth, 6);

        y += 6;
        doc.setDrawColor(220);
        doc.line(margin, y, margin + contentWidth, y);
        y += 6;
      }
    }
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
      const header = `Image: ${img?.name || item.imageId} ${img?.tag ? `(${img.tag})` : ""} • Statut: ${toFrenchStatus(item.status)}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      y = addWrappedText(doc, header, margin, y, contentWidth, 5);

      if (img?.dataUrl) {
        y += 2;
        const placedRes = await addImageBlock(doc, img.dataUrl, margin, y, Math.min(contentWidth, 100), 70);
        y = placedRes.nextY + 4;

        const boxes = item.boxes || [];
        if (boxes.length > 0) {
          drawBoxesOnPlaced(placedRes.placed, boxes);
        }
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const body = stripMarkdown(item.outputText?.trim() || (item.error ? `Erreur: ${item.error}` : "Pas de résultat disponible."));
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