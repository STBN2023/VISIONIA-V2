import { jsPDF } from "jspdf";
import type { Run } from "@/utils/runs";
import type { ProjectImage } from "@/utils/storage";
import { getProjectById } from "@/utils/storage";

// --- CONFIGURATION CONSTANTES ---
const MARGIN = 15;
const PAGE_HEIGHT = 297; // A4
const CONTENT_WIDTH = 210 - MARGIN * 2;
const BOTTOM_LIMIT = 275; // On ne dépasse jamais cette ligne Y pour le contenu

// --- UTILITAIRES ---

function stripMarkdown(input: string): string {
  if (!input) return "";
  let text = input.trim();
  text = text.replace(/^```.*$/gm, "");
  text = text.replace(/^[#]+\s*/gm, "");
  text = text.replace(/^[\-\*\+]\s+/gm, "");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/`([^`]*)`/g, "$1");
  return text;
}

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  if (!text) return y;
  const lines = doc.splitTextToSize(text, maxWidth);
  
  // Vérification espace pour TOUT le bloc de texte
  const heightNeeded = lines.length * lineHeight;
  if (y + heightNeeded > BOTTOM_LIMIT) {
    doc.addPage();
    y = 20; // Reprise en haut
  }

  for (const line of lines) {
    // Double sécurité saut de page ligne par ligne
    if (y > BOTTOM_LIMIT) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function checkPageBreak(doc: jsPDF, currentY: number, heightNeeded: number): number {
  if (currentY + heightNeeded > BOTTOM_LIMIT) {
    doc.addPage();
    return 20;
  }
  return currentY;
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
      return "en file d'attente";
    case "failed":
      return "échoué";
    default:
      return String(status);
  }
}

function drawSectionHeader(doc: jsPDF, text: string, x: number, y: number, width: number) {
  const lines = doc.splitTextToSize(text, width - 4);
  const boxHeight = lines.length * 5 + 6; // padding + lignes
  y = ensureSpace(doc, y, boxHeight + 4);
  doc.setFillColor(245);
  (doc as any).roundedRect(x, y - 4, width, boxHeight, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  y = addWrappedText(doc, text, x + 2, y, width - 4, 5);
  return y + 4;
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

function drawBoxesOnPlaced(doc: jsPDF, placed: PlacedImage, boxes: any[]) {
  // Dessin des rectangles (annotations)
  boxes.forEach((b: any) => {
    const px = placed.x + b.x * placed.w;
    const py = placed.y + b.y * placed.h;
    const pw = b.w * placed.w;
    const ph = b.h * placed.h;

    let r = 220, g = 40, bcol = 40; // Rouge par défaut
    if (b.color) {
      const rgb = hexToRgb(b.color);
      r = rgb[0]; g = rgb[1]; bcol = rgb[2];
    }

    doc.setDrawColor(r, g, bcol);
    doc.setLineWidth(0.7);
    doc.rect(px, py, pw, ph);

    if (b.label) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(r, g, bcol);
      // Label au-dessus du cadre
      doc.text(b.label, px, py - 1);
    }
  });
}

export async function exportRunToPdf(run: Run, images: ProjectImage[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const project = await getProjectById(run.projectId);

  // --- PAGE DE GARDE ---
  doc.setFillColor(30, 41, 59); // Bleu nuit ISOEDRE
  doc.rect(0, 0, 210, 297, "F"); // Fond page entière

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.text("ISOEDRE", 105, 100, { align: "center" });
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text("AUDIT TECHNIQUE & ÉNERGÉTIQUE", 105, 115, { align: "center" });

  doc.setDrawColor(255, 255, 255);
  doc.line(70, 130, 140, 130);

  doc.setFontSize(18);
  doc.text(project?.title || "Projet Sans Titre", 105, 150, { align: "center" });
  
  doc.setFontSize(12);
  doc.text(`Date du rapport : ${new Date().toLocaleDateString('fr-FR')}`, 105, 165, { align: "center" });
  if (project?.address) {
    doc.text(project.address, 105, 175, { align: "center" });
  }

  // --- DEBUT CONTENU (Page 2) ---
  doc.addPage();
  let y = 20;
  doc.setTextColor(0, 0, 0);

  // Parsing JSON
  const output = run.outputText?.trim() || "";
  let jsonData: any = null;
  try {
    if (output.includes("{")) {
      const cleanJson = output.replace(/```json\n?/, "").replace(/```$/, "").replace(/[\r\n\t]/g, " ").trim();
      // Tentative extraction { ... }
      const start = cleanJson.indexOf('{');
      const end = cleanJson.lastIndexOf('}');
      if (start >= 0 && end > start) {
        jsonData = JSON.parse(cleanJson.substring(start, end + 1));
      }
    }
  } catch (e) {
    console.error("PDF JSON Error", e);
  }

  // 1. CONTEXTE
  if (jsonData?.contexte_projet) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("1. CONTEXTE DE L'INTERVENTION", MARGIN, y);
    y += 10;

    const ctx = jsonData.contexte_projet;
    // Cadre gris clair
    doc.setFillColor(245, 247, 250);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 35, "F");
    
    doc.setFontSize(10);
    doc.text(`Type : ${ctx.type_intervention || "N/A"}`, MARGIN + 5, y + 8);
    doc.text(`Phase : ${ctx.phase || "N/A"}`, MARGIN + 5, y + 16);
    doc.text(`DPE Initial : ${ctx.dpe_initial || "N/A"}`, MARGIN + 100, y + 8);
    doc.text(`Date Analyse : ${ctx.date_analyse || ctx.date_analysis || "N/A"}`, MARGIN + 100, y + 16);
    
    y += 25;
    if (ctx.reserve_generale) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      y = addWrappedText(doc, `Note: ${ctx.reserve_generale}`, MARGIN + 5, y, CONTENT_WIDTH - 10, 4);
      y += 5; // Padding bas du cadre
    } else {
      y += 10;
    }
    
    y += 10; // Marge après le bloc contexte
    doc.setTextColor(0, 0, 0); // Reset noir
  }

  // 2. SYNTHESE LOTS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  y = checkPageBreak(doc, y, 20);
  doc.text("2. DÉTAIL DES OBSERVATIONS", MARGIN, y);
  y += 10;

  if (jsonData?.lots) {
    jsonData.lots.forEach((lot: any) => {
      // Titre du Lot (Saut de page si on est trop bas)
      y = checkPageBreak(doc, y, 30);
      
      doc.setFillColor(40, 50, 70);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      
      // Nettoyage nom lot
      let lotName = String(lot.lot || "Lot non défini");
      if (!lotName.toUpperCase().includes("LOT")) lotName = `LOT : ${lotName}`;
      doc.text(lotName, MARGIN + 3, y + 5.5);
      
      doc.setTextColor(0, 0, 0);
      y += 14;

      // Anomalies
      lot.anomalies?.forEach((ano: any, idx: number) => {
        // Estimer la hauteur de ce bloc pour décider si on saute une page
        // On prend une marge large (60mm mini par anomalie)
        y = checkPageBreak(doc, y, 60);

        if (idx > 0) {
          doc.setDrawColor(200, 200, 200);
          doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
          y += 5;
        }

        // Titre / Loc
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`${ano.id || ""} - ${ano.localisation || ""}`, MARGIN, y);
        y += 5;

        // Description
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Description :", MARGIN, y);
        doc.setFont("helvetica", "normal");
        y = addWrappedText(doc, ano.description || "", MARGIN + 25, y, CONTENT_WIDTH - 25, 5);
        y += 2;

        // Analyse
        doc.setFont("helvetica", "bold");
        doc.text("Analyse :", MARGIN, y);
        doc.setFont("helvetica", "normal");
        y = addWrappedText(doc, ano.analyse_technique || "", MARGIN + 25, y, CONTENT_WIDTH - 25, 5);
        y += 2;

        // Risques (Rouge)
        doc.setFont("helvetica", "bold");
        doc.setTextColor(180, 0, 0);
        doc.text("Risques :", MARGIN, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        y = addWrappedText(doc, ano.risques_associes || "", MARGIN + 25, y, CONTENT_WIDTH - 25, 5);
        y += 2;

        // CCTP (Bleu)
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 80, 180);
        doc.text("CCTP :", MARGIN, y);
        doc.setFont("helvetica", "bold"); // CCTP en gras
        doc.setTextColor(0, 0, 0);
        y = addWrappedText(doc, ano.prescription_cctp || "", MARGIN + 25, y, CONTENT_WIDTH - 25, 5);
        y += 4;
      });
      
      y += 8; // Espace entre lots
    });
  } else {
    // Fallback texte brut
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y = addWrappedText(doc, stripMarkdown(output), MARGIN, y, CONTENT_WIDTH, 5);
  }

  // 3. SYNTHESE
  if (jsonData?.synthese_energetique) {
    doc.addPage(); // Nouvelle page pour la synthèse
    y = 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("3. SYNTHÈSE ET RECOMMANDATIONS", MARGIN, y);
    y += 10;

    const syn = jsonData.synthese_energetique;
    
    // Cadre vert léger
    doc.setFillColor(235, 245, 235);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 60, "F"); // Hauteur fixe arbitraire, le texte dépassera si trop long (mais addWrappedText gère le Y)
    
    // On réinitialise Y pour écrire DANS le cadre (attention si ça dépasse)
    let insideY = y + 8;

    doc.setFontSize(11);
    doc.setTextColor(0, 100, 0);
    doc.text("POINTS CRITIQUES :", MARGIN + 5, insideY);
    insideY += 6;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    (syn.points_critiques || []).forEach((pt: string) => {
      insideY = addWrappedText(doc, `• ${pt}`, MARGIN + 10, insideY, CONTENT_WIDTH - 20, 5);
    });

    insideY += 6;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 100, 0);
    doc.text("RECOMMANDATIONS :", MARGIN + 5, insideY);
    insideY += 6;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    (syn.recommandations_globales || []).forEach((rec: string) => {
      insideY = addWrappedText(doc, `→ ${rec}`, MARGIN + 10, insideY, CONTENT_WIDTH - 20, 5);
    });

    // Impact DPE
    insideY += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 100, 0);
    doc.text(`IMPACT DPE ESTIMÉ : ${syn.impact_dpe_estime || "N/A"}`, MARGIN + 5, insideY);
    
    y = insideY + 20; // Sortie du bloc synthèse
    doc.setTextColor(0, 0, 0);
  }

  // 4. ANNEXE IMAGES
  doc.addPage();
  y = 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("4. ANNEXE PHOTOGRAPHIQUE", MARGIN, y);
  y += 10;

  if (run.items) {
    for (const item of run.items) {
      const img = images.find(i => i.id === item.imageId);
      if (!img || !img.dataUrl) continue;

      // On s'assure d'avoir la place pour une image (hauteur ~90mm)
      y = checkPageBreak(doc, y, 100);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Réf : ${img.name}`, MARGIN, y);
      y += 5;

      // Image
      try {
        const placed = await addImageBlock(doc, img.dataUrl, MARGIN, y, 140, 90); // Image plus grande
        // Annotations
        if (item.boxes && item.boxes.length > 0) {
          drawBoxesOnPlaced(doc, placed.placed, item.boxes);
        }
        y = placed.nextY + 15; // Marge après image
      } catch (e) {
        console.error("Erreur image PDF", e);
        doc.text("[Image non disponible]", MARGIN, y + 10);
        y += 20;
      }
    }
  }

  // Save
  const filename = `Rapport_ISOEDRE_${project?.title || "Projet"}.pdf`;
  doc.save(filename);
}