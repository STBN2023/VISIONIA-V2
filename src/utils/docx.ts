import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  TableCell,
  TableRow,
  Table,
  WidthType,
  ShadingType,
  ImageRun,
  type ISectionOptions,
} from "docx";
import { saveAs } from "file-saver";
import type { Run } from "@/utils/runs";
import type { ProjectImage } from "@/utils/storage";
import { getProjectById } from "@/utils/storage";

// --- Helpers ---

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

function parseRunJson(text: string): any | null {
  if (!text) return null;
  try {
    let clean = text.trim();
    const mdMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (mdMatch) clean = mdMatch[1].trim();
    const start = clean.indexOf("{");
    if (start === -1) return null;
    let candidate = clean.substring(start);
    if (!candidate.endsWith("}")) candidate += '"]}]}';
    const sanitized = candidate.replace(/\r?\n|\r/g, " ").replace(/\t/g, " ");
    try {
      return JSON.parse(sanitized);
    } catch {
      return JSON.parse(sanitized + "}");
    }
  } catch {
    return null;
  }
}

function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  return resp.arrayBuffer();
}

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const resp = await fetch(dataUrl);
  return resp.arrayBuffer();
}

async function getImageBuffer(src: string): Promise<ArrayBuffer | null> {
  try {
    if (isRemoteUrl(src)) {
      return await fetchAsArrayBuffer(src);
    }
    return await dataUrlToArrayBuffer(src);
  } catch {
    return null;
  }
}

function getImageDimensions(
  buffer: ArrayBuffer
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 800, height: 600 });
    };
    img.src = url;
  });
}

// --- Color helpers ---
const BLUE_DARK = "1E293B";
const BLUE_ACCENT = "3B82F6";
const RED_ACCENT = "DC2626";
const GREEN_ACCENT = "16A34A";
const GRAY_BG = "F1F5F9";

type DocChild = Paragraph | Table;

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ heading: level, children: [new TextRun({ text, bold: true })] });
}

function labelValue(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `${label} : `, bold: true, size: 20 }),
      new TextRun({ text: value || "N/A", size: 20 }),
    ],
  });
}

function bulletPoint(text: string, color?: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 20, color: color })],
  });
}

// --- Main export ---

export async function exportRunToDocx(run: Run, images: ProjectImage[]) {
  const project = await getProjectById(run.projectId);
  const jsonData = parseRunJson(run.outputText || "");

  const sections: DocChild[] = [];

  // --- TITLE PAGE ---
  sections.push(
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "ISOEDRE",
          bold: true,
          size: 72,
          color: BLUE_DARK,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: "AUDIT TECHNIQUE & ÉNERGÉTIQUE",
          size: 28,
          color: "64748B",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: project?.title || "Projet Sans Titre",
          bold: true,
          size: 36,
          color: BLUE_DARK,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `Date du rapport : ${new Date().toLocaleDateString("fr-FR")}`,
          size: 22,
          color: "64748B",
        }),
      ],
    })
  );

  if (project?.address) {
    sections.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: project.address, size: 22, color: "64748B" }),
        ],
      })
    );
  }

  sections.push(
    new Paragraph({ children: [], pageBreakBefore: true })
  );

  // --- 1. CONTEXTE ---
  if (jsonData?.contexte_projet) {
    const ctx = jsonData.contexte_projet;
    sections.push(heading("1. CONTEXTE DE L'INTERVENTION", HeadingLevel.HEADING_1));

    const contextRows = [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: GRAY_BG },
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [labelValue("Type", ctx.type_intervention)],
          }),
          new TableCell({
            shading: { type: ShadingType.SOLID, color: GRAY_BG },
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [labelValue("DPE Initial", ctx.dpe_initial)],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: GRAY_BG },
            children: [labelValue("Phase", ctx.phase)],
          }),
          new TableCell({
            shading: { type: ShadingType.SOLID, color: GRAY_BG },
            children: [
              labelValue(
                "Date Analyse",
                ctx.date_analyse || ctx.date_analysis
              ),
            ],
          }),
        ],
      }),
    ];

    sections.push(
      new Table({
        rows: contextRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );

    if (ctx.reserve_generale) {
      sections.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          children: [
            new TextRun({
              text: "Réserve générale : ",
              bold: true,
              italics: true,
              size: 20,
              color: "6B7280",
            }),
            new TextRun({
              text: ctx.reserve_generale,
              italics: true,
              size: 20,
              color: "6B7280",
            }),
          ],
        })
      );
    }
  }

  // --- 2. LOTS & ANOMALIES ---
  sections.push(heading("2. DÉTAIL DES OBSERVATIONS", HeadingLevel.HEADING_1));

  if (jsonData?.lots) {
    for (const lot of jsonData.lots) {
      let lotName = String(lot.lot || "Lot non défini");
      if (!lotName.toUpperCase().includes("LOT")) lotName = `LOT : ${lotName}`;

      sections.push(
        new Paragraph({
          spacing: { before: 300, after: 100 },
          shading: { type: ShadingType.SOLID, color: BLUE_DARK },
          children: [
            new TextRun({
              text: `  ${lotName.toUpperCase()}`,
              bold: true,
              size: 24,
              color: "FFFFFF",
            }),
          ],
        })
      );

      for (const ano of lot.anomalies || []) {
        // ID + Localisation
        sections.push(
          new Paragraph({
            spacing: { before: 200, after: 60 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
            },
            children: [
              new TextRun({
                text: `${ano.id || ""} — ${ano.localisation || ""}`,
                bold: true,
                size: 22,
                color: BLUE_ACCENT,
              }),
              ano.impact_energetique
                ? new TextRun({
                    text: `  [${ano.impact_energetique.toUpperCase()}]`,
                    bold: true,
                    size: 18,
                    color:
                      ano.impact_energetique === "fort" ||
                      ano.impact_energetique === "critique"
                        ? RED_ACCENT
                        : "D97706",
                  })
                : new TextRun({ text: "" }),
            ],
          })
        );

        // Description
        sections.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "Description : ", bold: true, size: 20 }),
              new TextRun({ text: ano.description || "", size: 20 }),
            ],
          })
        );

        // Analyse technique
        sections.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "Analyse technique : ", bold: true, size: 20 }),
              new TextRun({ text: ano.analyse_technique || "", size: 20 }),
            ],
          })
        );

        // Risques
        sections.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: "Risques : ",
                bold: true,
                size: 20,
                color: RED_ACCENT,
              }),
              new TextRun({
                text: ano.risques_associes || "",
                italics: true,
                size: 20,
              }),
            ],
          })
        );

        // Prescription CCTP
        sections.push(
          new Paragraph({
            spacing: { after: 60 },
            shading: { type: ShadingType.SOLID, color: "EFF6FF" },
            children: [
              new TextRun({
                text: "Prescription CCTP : ",
                bold: true,
                size: 20,
                color: BLUE_ACCENT,
              }),
              new TextRun({
                text: ano.prescription_cctp || "",
                bold: true,
                size: 20,
              }),
            ],
          })
        );

        // Références normatives
        if (ano.references_normatives?.length) {
          sections.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: `Réf. normatives : ${ano.references_normatives.join(", ")}`,
                  size: 18,
                  color: "6B7280",
                }),
              ],
            })
          );
        }

        // Budget
        if (ano.estimation_budgetaire) {
          sections.push(
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: `Budget estimé : ${ano.estimation_budgetaire}`,
                  bold: true,
                  size: 20,
                  color: GREEN_ACCENT,
                }),
              ],
            })
          );
        }
      }
    }
  } else {
    // Fallback texte brut
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: stripMarkdown(run.outputText || "Aucune donnée"),
            size: 20,
          }),
        ],
      })
    );
  }

  // --- 3. SYNTHESE ---
  if (jsonData?.synthese_energetique) {
    const syn = jsonData.synthese_energetique;
    sections.push(
      new Paragraph({ children: [], pageBreakBefore: true }),
      heading("3. SYNTHÈSE ET RECOMMANDATIONS", HeadingLevel.HEADING_1)
    );

    sections.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: "Points critiques",
            bold: true,
            size: 24,
            color: RED_ACCENT,
          }),
        ],
      })
    );
    for (const pt of syn.points_critiques || []) {
      sections.push(bulletPoint(pt, RED_ACCENT));
    }

    sections.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: "Recommandations globales",
            bold: true,
            size: 24,
            color: GREEN_ACCENT,
          }),
        ],
      })
    );
    for (const rec of syn.recommandations_globales || []) {
      sections.push(bulletPoint(rec, GREEN_ACCENT));
    }

    if (syn.impact_dpe_estime) {
      sections.push(
        new Paragraph({
          spacing: { before: 300 },
          shading: { type: ShadingType.SOLID, color: "F0FDF4" },
          children: [
            new TextRun({
              text: `IMPACT DPE ESTIMÉ : ${syn.impact_dpe_estime}`,
              bold: true,
              size: 28,
              color: GREEN_ACCENT,
            }),
          ],
        })
      );
    }
  }

  // --- 4. FICHES PAR IMAGE ---
  if (run.items && run.items.length > 0) {
    sections.push(
      new Paragraph({ children: [], pageBreakBefore: true }),
      heading("4. FICHES DÉTAILLÉES PAR IMAGE", HeadingLevel.HEADING_1)
    );

    for (const item of run.items) {
      const img = images.find((i) => i.id === item.imageId);
      if (!img) continue;

      sections.push(
        new Paragraph({
          spacing: { before: 300, after: 100 },
          shading: { type: ShadingType.SOLID, color: GRAY_BG },
          children: [
            new TextRun({
              text: `  Réf : ${img.name}`,
              bold: true,
              size: 22,
            }),
          ],
        })
      );

      // Try to embed image
      if (img.dataUrl) {
        const buffer = await getImageBuffer(img.dataUrl);
        if (buffer) {
          const dims = await getImageDimensions(buffer);
          const maxW = 500;
          const scale = Math.min(maxW / dims.width, 1);
          const w = Math.round(dims.width * scale);
          const h = Math.round(dims.height * scale);

          sections.push(
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new ImageRun({
                  data: buffer,
                  transformation: { width: w, height: h },
                  type: "jpg",
                }),
              ],
            })
          );
        }
      }

      // Item analysis text
      const itemJson = parseRunJson(item.outputText || "");
      if (itemJson?.lots) {
        for (const lot of itemJson.lots) {
          for (const ano of lot.anomalies || []) {
            sections.push(
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun({ text: "Observation : ", bold: true, size: 18 }),
                  new TextRun({ text: ano.description || "", size: 18 }),
                ],
              }),
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun({ text: "Analyse : ", bold: true, size: 18 }),
                  new TextRun({ text: ano.analyse_technique || "", size: 18 }),
                ],
              }),
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: "Risques : ",
                    bold: true,
                    size: 18,
                    color: RED_ACCENT,
                  }),
                  new TextRun({
                    text: ano.risques_associes || "",
                    italics: true,
                    size: 18,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: "Action CCTP : ",
                    bold: true,
                    size: 18,
                    color: BLUE_ACCENT,
                  }),
                  new TextRun({ text: ano.prescription_cctp || "", size: 18 }),
                ],
              })
            );
          }
        }
      } else if (item.outputText) {
        sections.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: stripMarkdown(item.outputText).substring(0, 1500),
                size: 18,
              }),
            ],
          })
        );
      }
    }
  }

  // --- BUILD & SAVE ---
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: sections,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `Rapport_ISOEDRE_${project?.title || "Projet"}.docx`;
  saveAs(blob, filename);
}