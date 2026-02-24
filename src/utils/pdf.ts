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
      return "en file d'attente";
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

// Ajout: gestion des sauts de page et en-têtes de sections
const PAGE_TOP = 20;
const PAGE_BOTTOM = 280;

function pageBreak(doc: jsPDF) {
  doc.addPage();
  return PAGE_TOP;
}

function ensureSpace(doc: jsPDF, y: number, needed: number) {
  return y + needed > PAGE_BOTTOM ? pageBreak(doc) : y;
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

export async function exportRunToPdf(run: Run, images: ProjectImage[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const contentWidth = 210 - margin * 2;
  const project = await getProjectById(run.projectId);

  // --- ENTÊTE PROFESSIONNELLE ---
  // Bandeau supérieur
  doc.setFillColor(30, 41, 59); // Bleu nuit ISOEDRE
  doc.rect(0, 0, 210, 35, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("ISOEDRE", margin, 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("VISION IA - AUDIT TECHNIQUE & ÉNERGÉTIQUE", margin, 26);

  // Infos Projet à droite dans l'entête
  doc.setFontSize(9);
  doc.text(`Rapport généré le : ${new Date().toLocaleDateString('fr-FR')}`, 210 - margin, 18, { align: "right" });
  doc.text(`Projet : ${project?.title || "Sans titre"}`, 210 - margin, 24, { align: "right" });
  if (project?.location) {
    doc.text(`Adresse : ${project.location}`, 210 - margin, 30, { align: "right" });
  }

  let y = 45;
  doc.setTextColor(0, 0, 0);

  // --- BLOC CONTEXTE (si présent dans le JSON) ---
  const output = run.outputText?.trim() || "";
  let jsonData: any = null;
  try {
    if (output.startsWith("{") || output.includes('"lots"')) {
      const cleanJson = output.replace(/```json\n?/, "").replace(/```$/, "").replace(/\n/g, " ").trim();
      jsonData = JSON.parse(cleanJson);
    }
  } catch (e) {
    console.error("PDF: Erreur parsing JSON pour contexte", e);
  }

  if (jsonData?.contexte_projet) {
    const ctx = jsonData.contexte_projet;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("1. CONTEXTE DE L'INTERVENTION", margin, y);
    y += 6;
    
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "F");
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Type :", margin + 5, y + 8);
    doc.text("Phase :", margin + 5, y + 14);
    doc.text("DPE Initial :", margin + 90, y + 8);
    doc.text("Date Analyse :", margin + 90, y + 14);

    doc.setFont("helvetica", "normal");
    doc.text(String(ctx.type_intervention || "N/A"), margin + 25, y + 8);
    doc.text(String(ctx.phase || "N/A"), margin + 25, y + 14);
    doc.text(String(ctx.dpe_initial || "N/A"), margin + 115, y + 8);
    doc.text(String(ctx.date_analyse || ctx.date_analysis || "N/A"), margin + 115, y + 14);
    
    y += 26;

    if (ctx.reserve_generale) {
      doc.setFont("helvetica", "bold");
      doc.text("RÉSERVE GÉNÉRALE :", margin, y);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      y = addWrappedText(doc, ctx.reserve_generale, margin + 40, y, contentWidth - 40, 4);
      y += 6;
    }
  }

  // --- ANALYSE PAR LOTS ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("2. SYNTHÈSE DES PATHOLOGIES PAR LOT", margin, y);
  y += 8;

  if (jsonData?.lots) {
    jsonData.lots.forEach((lot: any) => {
      // Entête de Lot stylisée
      y = ensureSpace(doc, y, 20);
      doc.setFillColor(51, 65, 85);
      doc.rect(margin, y - 5, contentWidth, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      
      // Nettoyage de la redondance "LOT : LOT"
      let lotName = lot.lot || "Général";
      const displayLot = lotName.toUpperCase().startsWith("LOT") ? lotName : `LOT : ${lotName}`;
      
      doc.text(displayLot, margin + 3, y + 1);
      doc.setTextColor(0, 0, 0);
      y += 10;

      lot.anomalies?.forEach((ano: any, aIdx: number) => {
        y = ensureSpace(doc, y, 40);
        if (aIdx > 0) {
          doc.setDrawColor(230);
          doc.line(margin + 10, y - 4, margin + contentWidth - 10, y - 4);
          y += 4;
        }

        // ID et Localisation
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(`${ano.id || "ANO"} | ${ano.image_ref || ""} | ${ano.localisation || ""}`, margin, y);
        y += 5;

        // Description & Analyse (Deux colonnes)
        doc.setFontSize(9);
        doc.text("Description :", margin, y);
        doc.setFont("helvetica", "normal");
        const descY = addWrappedText(doc, ano.description || "N/A", margin + 25, y, contentWidth - 25, 4.5);
        
        doc.setFont("helvetica", "bold");
        doc.text("Analyse :", margin, descY);
        doc.setFont("helvetica", "normal");
        y = addWrappedText(doc, ano.analyse_technique || "N/A", margin + 25, descY, contentWidth - 25, 4.5);

        // Risques (Rouge)
        doc.setFont("helvetica", "bold");
        doc.setTextColor(180, 0, 0);
        doc.text("Risques :", margin, y);
        doc.setFont("helvetica", "italic");
        y = addWrappedText(doc, ano.risques_associes || "N/A", margin + 25, y, contentWidth - 25, 4.5);

        // CCTP (Bleu + Gras)
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 80, 160);
        doc.text("CCTP :", margin, y);
        y = addWrappedText(doc, ano.prescription_cctp || "N/A", margin + 25, y, contentWidth - 25, 4.5);

        // Budget & Normes
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        let extraInfo = "";
        if (ano.references_normatives?.length) extraInfo += `Normes : ${ano.references_normatives.join(", ")} `;
        if (ano.impact_energetique) extraInfo += `| Impact : ${ano.impact_energetique} `;
        if (ano.estimation_budgetaire) extraInfo += `| Budget : ${ano.estimation_budgetaire}`;
        
        if (extraInfo) {
          y = addWrappedText(doc, extraInfo, margin + 25, y, contentWidth - 25, 4);
        }
        
        y += 6;
      });
      y += 4;
    });
  } else {
    // Fallback texte brut
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y = addWrappedText(doc, stripMarkdown(output), margin, y, contentWidth, 5);
  }

  // --- SYNTHÈSE FINALE ---
  if (jsonData?.synthese_energetique) {
    y = pageBreak(doc);
    const syn = jsonData.synthese_energetique;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("3. SYNTHÈSE ET PRÉCONISATIONS GLOBALES", margin, y);
    y += 8;

    doc.setFillColor(232, 245, 233); // Fond vert léger
    doc.roundedRect(margin, y, contentWidth, 40, 2, 2, "F");
    
    doc.setFontSize(10);
    doc.setTextColor(27, 94, 32);
    doc.text("POINTS CRITIQUES :", margin + 5, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    let synY = y + 13;
    (syn.points_critiques || []).forEach((p: string) => {
      synY = addWrappedText(doc, `• ${p}`, margin + 10, synY, contentWidth - 15, 5);
    });

    synY += 4;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(27, 94, 32);
    doc.text("IMPACT DPE ESTIMÉ :", margin + 5, synY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(String(syn.impact_dpe_estime || "Non évaluable"), margin + 50, synY);
    
    y = synY + 10;
  }

  // --- DÉTAILS IMAGES ---
  if (run.items && run.items.length > 0) {
    y = pageBreak(doc);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    y = drawSectionHeader(doc, "4. ANNEXE PHOTOGRAPHIQUE ET ANNOTATIONS", margin, y, contentWidth);

    for (const item of run.items) {
      y = ensureSpace(doc, y, 100);
      const img = images.find((i) => i.id === item.imageId);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Réf : ${img?.name || item.imageId}`, margin, y);
      y += 4;

      if (img?.dataUrl) {
        const placedRes = await addImageBlock(doc, img.dataUrl, margin, y, 120, 80);
        const boxes = item.boxes || [];
        if (boxes.length > 0) {
          drawBoxesOnPlaced(placedRes.placed, boxes);
        }
        y = placedRes.nextY + 10;
      }
    }
  }

  const filename = `ISOEDRE_VisionIA_Rapport_${project?.title || "Export"}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}