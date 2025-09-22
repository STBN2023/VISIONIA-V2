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

export function exportRunToPdf(run: Run, images: ProjectImage[]) {
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

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const body = item.outputText?.trim() || (item.error ? `Erreur: ${item.error}` : "Pas de résultat disponible.");
      y = addWrappedText(doc, body, margin, y + 2, contentWidth, 6);

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