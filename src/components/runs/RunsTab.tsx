import { Component, useMemo, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectImage } from "@/utils/storage";
import type { Run, RunItem } from "@/utils/runs";
import { cancelRun, retryFailedItems, deleteRun, updateRunItemBoxes } from "@/utils/runs";
import { showSuccess } from "@/utils/toast";
import { FileText, Trash2, Pencil, FileDown } from "lucide-react";
import { exportRunToPdf } from "@/utils/pdf";
import { exportRunToDocx } from "@/utils/docx";
import RunLogDialog from "./RunLogDialog";
import AnnotateDialog from "./AnnotateDialog";
import AnomalyPreview from "./AnomalyPreview";

// --- Types for inline image lookup ---
type ImageLookup = {
  /** Map image name (or partial) -> ProjectImage + RunItem (for boxes) */
  byName: Map<string, { img: ProjectImage; item?: RunItem }>;
  /** All run items with their images */
  items: { img: ProjectImage; item: RunItem }[];
};

function buildImageLookup(images: ProjectImage[], runItems?: RunItem[]): ImageLookup {
  const byName = new Map<string, { img: ProjectImage; item?: RunItem }>();
  const items: { img: ProjectImage; item: RunItem }[] = [];

  for (const img of images) {
    byName.set(img.name.toLowerCase(), { img });
    // Also index by id
    byName.set(img.id.toLowerCase(), { img });
  }

  if (runItems) {
    for (const item of runItems) {
      const img = images.find(i => i.id === item.imageId);
      if (img) {
        items.push({ img, item });
        // Override with item info for boxes
        byName.set(img.name.toLowerCase(), { img, item });
        byName.set(img.id.toLowerCase(), { img, item });
      }
    }
  }

  return { byName, items };
}

/** Try to find matching image for an anomaly's image_ref field */
function findImageForRef(ref: string | string[] | undefined, lookup: ImageLookup): { img: ProjectImage; item?: RunItem } | null {
  if (!ref) return null;
  const refs = Array.isArray(ref) ? ref : [ref];

  for (const r of refs) {
    const key = r.toLowerCase().trim();
    // Direct match
    const direct = lookup.byName.get(key);
    if (direct) return direct;

    // Try matching by index (IMG-001 -> index 0)
    const indexMatch = key.match(/img[_-]?(\d+)/i);
    if (indexMatch) {
      const idx = parseInt(indexMatch[1], 10) - 1;
      if (idx >= 0 && idx < lookup.items.length) {
        return lookup.items[idx];
      }
    }

    // Fuzzy: find any image whose name contains the ref
    for (const [name, entry] of lookup.byName) {
      if (name.includes(key) || key.includes(name)) return entry;
    }
  }
  return null;
}

/**
 * Rend affichable n'importe quelle valeur venue du LLM.
 *
 * Le rapport est du JSON produit par le modèle : rien ne garantit qu'un champ
 * attendu comme texte en soit un. Un `impact_energetique` renvoyé sous la forme
 * { niveau, justification } faisait lever à React l'erreur #31 et laissait la
 * page entièrement blanche — pas seulement la section fautive.
 */
function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(" · ");
  if (typeof v === "object") {
    // On aplatit plutôt que de perdre l'information : « élevé — façade exposée ».
    return Object.values(v as Record<string, unknown>).map(asText).filter(Boolean).join(" — ");
  }
  return String(v);
}

/** Idem pour les listes : le modèle renvoie parfois un objet ou une chaîne seule. */
function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === "") return [];
  return [v];
}

/**
 * Dernier filet : une structure inattendue dégrade en texte brut au lieu de
 * vider la page. asText() couvre les cas connus, ceci couvre les autres.
 */
class ReportErrorBoundary extends Component<
  { fallbackText: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[RunsTab] Mise en forme du rapport impossible", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="space-y-2">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Ce rapport n'a pas pu être mis en forme : le modèle a renvoyé une structure
            inattendue. Le texte brut est affiché ci-dessous.
          </p>
          <pre className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-sm text-gray-700">
            {this.props.fallbackText}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Ajout d'un composant pour afficher le JSON structuré par lots
const StructuredAnalysisView = ({ text, imageLookup }: { text: string; imageLookup?: ImageLookup }) => {
  const parsedData = useMemo(() => {
    if (!text) return null;
    try {
      let cleanText = text.trim();
      const markdownMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (markdownMatch) {
        cleanText = markdownMatch[1].trim();
      }

      const start = cleanText.indexOf('{');
      if (start === -1) return null;
      
      let jsonCandidate = cleanText.substring(start);
      
      if (!jsonCandidate.endsWith('}')) {
        jsonCandidate = jsonCandidate.trim();
        jsonCandidate += '"]}]}'; 
      }

      const sanitized = jsonCandidate
        .replace(/\r?\n|\r/g, " ")
        .replace(/\t/g, " ");

      try {
        return JSON.parse(sanitized);
      } catch (e) {
        return JSON.parse(sanitized + '}');
      }
    } catch (e) {
      return null;
    }
  }, [text]);

  if (!parsedData) {
    return (
      <div className="space-y-2">
        <pre className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm font-mono border border-gray-200 text-gray-700">{text}</pre>
        <div className="text-[10px] text-gray-400 italic px-2">
          Note: Le format JSON reçu est malformé. L'IA a probablement inclus des retours à la ligne non autorisés.
        </div>
      </div>
    );
  }

  const data = parsedData;
  const hasContext = !!data.contexte_projet;
  const lots = asArray(data.lots);

  return (
    <div className="space-y-6 mt-2">
      {/* BLOC CONTEXTE PROJET */}
      {hasContext && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h3 className="text-blue-700 font-bold uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></span>
            Contexte de l'Audit
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-[12px]">
            <div className="bg-white p-2 rounded-lg border border-blue-100">
              <span className="text-gray-500 block mb-0.5 text-[10px] uppercase font-semibold">Intervention</span>
              <span className="text-gray-800 font-bold">{asText(data.contexte_projet.type_intervention)}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-blue-100">
              <span className="text-gray-500 block mb-0.5 text-[10px] uppercase font-semibold">Phase</span>
              <span className="text-gray-800 font-bold">{asText(data.contexte_projet.phase)}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-blue-100">
              <span className="text-gray-500 block mb-0.5 text-[10px] uppercase font-semibold">Date</span>
              <span className="text-gray-800 font-bold">{asText(data.contexte_projet.date_analysis || data.contexte_projet.date_analyse)}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-blue-100">
              <span className="text-gray-500 block mb-0.5 text-[10px] uppercase font-semibold">DPE Initial</span>
              <span className="text-gray-800 font-bold">{asText(data.contexte_projet.dpe_initial) || "N/A"}</span>
            </div>
          </div>
          {data.contexte_projet.reserve_generale && (
            <div className="mt-4 pt-3 border-t border-blue-200">
              <p className="text-[11px] text-gray-600 italic leading-relaxed">
                <span className="font-bold text-blue-700 not-italic mr-1">RÉSERVE GÉNÉRALE :</span> {asText(data.contexte_projet.reserve_generale)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* LISTE DES LOTS ET ANOMALIES */}
      {lots.map((lot: any, idx: number) => {
        let lotName = asText(lot.lot) || "Général";
        const displayLot = lotName.toUpperCase().startsWith("LOT") ? lotName : `LOT : ${lotName}`;
        
        return (
          <div key={idx} className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="bg-gray-100 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-black text-gray-800 uppercase tracking-widest text-sm">{displayLot}</h3>
              <Badge variant="secondary" className="bg-gray-200 text-gray-700 border-gray-300 font-bold px-3 py-1">
                {asArray(lot.anomalies).length} POINT(S) D'ATTENTION
              </Badge>
            </div>
            <div className="divide-y divide-gray-100">
              {asArray(lot.anomalies).map((ano: any, aIdx: number) => {
                // Find matching image for this anomaly
                const matchedImage = imageLookup ? findImageForRef(ano.image_ref, imageLookup) : null;

                return (
                  <div key={aIdx} className="p-5 space-y-5 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-[10px] font-mono bg-blue-100 px-2 py-0.5 rounded border border-blue-200 text-blue-700 font-bold">{asText(ano.id)}</span>
                          <span className="text-[11px] text-gray-500 font-medium">IMAGE: {asArray(ano.image_ref).map(asText).join(", ")}</span>
                          <span className="text-[11px] text-gray-400">•</span>
                          <span className="text-[11px] text-gray-500 font-medium">LOCALISATION: {asText(ano.localisation)}</span>
                        </div>
                        <p className="text-base text-gray-900 font-bold leading-snug">{asText(ano.description)}</p>
                      </div>
                      <div className="flex flex-col gap-2 items-end shrink-0">
                        {ano.impact_energetique && (
                          <span className={`text-[10px] px-3 py-1 rounded-md border-2 uppercase font-black ${
                            ano.impact_energetique === 'fort' || ano.impact_energetique === 'critique' 
                            ? 'bg-red-100 text-red-700 border-red-300' 
                            : 'bg-orange-100 text-orange-700 border-orange-300'
                          }`}>
                            {asText(ano.impact_energetique)}
                          </span>
                        )}
                        {ano.priorite_intervention && (
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 uppercase tracking-tighter">
                            {asText(ano.priorite_intervention)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* IMAGE INLINE — associated to this anomaly */}
                    {matchedImage && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                        <AnomalyPreview
                          src={matchedImage.img.dataUrl}
                          alt={matchedImage.img.name}
                          boxes={matchedImage.item?.boxes || []}
                          height={220}
                        />
                        <div className="px-3 py-1.5 text-[10px] text-gray-400 flex items-center justify-between">
                          <span>{matchedImage.img.name}</span>
                          {matchedImage.item?.boxes?.length ? (
                            <Badge variant="secondary" className="text-[9px] h-4">{matchedImage.item.boxes.length} annotation{matchedImage.item.boxes.length > 1 ? "s" : ""}</Badge>
                          ) : null}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                        <div className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Analyse Technique</div>
                        <p className="text-sm text-gray-700 leading-relaxed">{asText(ano.analyse_technique)}</p>
                      </div>
                      <div className="space-y-2 bg-red-50 p-3 rounded-xl border border-red-200">
                        <div className="text-[10px] uppercase font-black text-red-400 tracking-wider">Risques & Durabilité</div>
                        <p className="text-sm text-red-700 italic leading-relaxed">{asText(ano.risques_associes)}</p>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-xl border-2 border-blue-200">
                      <div className="text-[10px] uppercase font-black text-blue-600 tracking-widest mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                        Prescription CCTP (Action MOE)
                      </div>
                      <p className="text-sm text-blue-900 font-bold leading-relaxed">
                        {asText(ano.prescription_cctp)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                      <div className="flex flex-wrap gap-2">
                        {asArray(ano.references_normatives).map((ref: unknown, rIdx: number) => (
                          <span key={rIdx} className="text-[10px] bg-gray-100 px-3 py-1 rounded border border-gray-300 text-gray-700 font-bold">
                            {asText(ref)}
                          </span>
                        ))}
                      </div>
                      {ano.estimation_budgetaire && (
                        <div className="text-[11px] font-black text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border-2 border-green-300">
                          BUDGET EST. : {asText(ano.estimation_budgetaire)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* SYNTHESE ENERGETIQUE FINALE */}
      {data.synthese_energetique && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm space-y-5">
          <h3 className="text-green-700 font-black uppercase text-sm tracking-widest flex items-center gap-3">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            Synthèse & Recommandations Globales
          </h3>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-200">
              <div className="text-[11px] uppercase font-black text-gray-400 tracking-widest border-b border-gray-200 pb-2">Points Critiques</div>
              <ul className="space-y-2">
                {asArray(data.synthese_energetique.points_critiques).map((p: unknown, i: number) => (
                  <li key={i} className="text-xs text-gray-700 flex gap-2">
                    <span className="text-red-500 font-bold">•</span>
                    {asText(p)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-200">
              <div className="text-[11px] uppercase font-black text-gray-400 tracking-widest border-b border-gray-200 pb-2">Recommandations</div>
              <ul className="space-y-2">
                {asArray(data.synthese_energetique.recommandations_globales).map((r: unknown, i: number) => (
                  <li key={i} className="text-xs text-gray-700 flex gap-2">
                    <span className="text-green-600 font-bold">→</span>
                    {asText(r)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {data.synthese_energetique.impact_dpe_estime && (
            <div className="pt-4 mt-2 border-t-2 border-green-200 flex justify-between items-center px-2">
              <span className="text-sm text-gray-600 font-bold">IMPACT DPE ESTIMÉ :</span>
              <span className="text-xl font-black text-green-700 bg-white px-4 py-1 rounded-full border border-green-300">
                {asText(data.synthese_energetique.impact_dpe_estime)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const statusVariant = (s: string) =>
  s === "succeeded"
    ? "secondary"
    : s === "running"
    ? "default"
    : s === "queued"
    ? "outline"
    : s === "failed"
    ? "destructive"
    : "outline";

type Props = {
  runs: Run[];
  images: ProjectImage[];
};

const RunsTab = ({ runs, images }: Props) => {
  const photoRuns = useMemo(() => runs.filter((r) => r.mode === "per_image"), [runs]);
  const promptRuns = useMemo(() => runs.filter((r) => r.mode === "aggregate"), [runs]);

  const defaultTab = useMemo(() => {
    if (runs.length > 0) {
      return runs[0].mode === "aggregate" ? "prompt" : "photos";
    }
    return "prompt";
  }, [runs]);

  const [logRunId, setLogRunId] = useState<string | null>(null);
  const logRun = useMemo(() => runs.find((r) => r.id === logRunId) ?? null, [runs, logRunId]);

  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotateRunId, setAnnotateRunId] = useState<string | null>(null);
  const [annotateItemId, setAnnotateItemId] = useState<string | null>(null);

  const annotateImage = useMemo(() => {
    if (!annotateRunId || !annotateItemId) return null;
    const run = runs.find((r) => r.id === annotateRunId);
    const item = run?.items.find((i) => i.id === annotateItemId);
    const img = images.find((im) => im.id === item?.imageId) || null;
    return img || null;
  }, [annotateRunId, annotateItemId, runs, images]);

  const annotateBoxes = useMemo(() => {
    if (!annotateRunId || !annotateItemId) return [];
    const run = runs.find((r) => r.id === annotateRunId);
    const item = run?.items.find((i) => i.id === annotateItemId);
    return item?.boxes || [];
  }, [annotateRunId, annotateItemId, runs]);

  return (
    <div className="mt-4">
      <Card className="rounded-3xl border-gray-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-gray-800">Historique des analyses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="bg-gray-100 text-gray-600">
              <TabsTrigger value="prompt">Comptes rendus (Prompt)</TabsTrigger>
              <TabsTrigger value="photos">Analyses par image</TabsTrigger>
            </TabsList>

            {/* Onglet: runs par image (annotations) */}
            <TabsContent value="photos" className="space-y-4">
              {photoRuns.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun run "par image" pour le moment.</p>
              ) : (
                photoRuns.map((run) => {
                  const lookup = buildImageLookup(images, run.items);
                  return (
                    <div key={run.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-3">
                        <div className="flex items-center gap-2">
                          {run.status === "failed" ? (
                            <button type="button" onClick={() => setLogRunId(run.id)} className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400" title="Voir le log d'erreur">
                              <Badge variant={statusVariant(run.status)}>failed</Badge>
                            </button>
                          ) : (
                            <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                          )}
                          <span className="text-sm text-gray-700">Mode: Par image</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" disabled={run.status !== "succeeded"} onClick={async () => { await exportRunToPdf(run, images); }} className="border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FileText className="mr-2 h-4 w-4" />PDF</Button>
                          <Button size="sm" variant="outline" disabled={run.status !== "succeeded"} onClick={async () => { await exportRunToDocx(run, images); }} className="border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FileDown className="mr-2 h-4 w-4" />DOCX</Button>
                          <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Supprimer ce run ?")) { await deleteRun(run.id); showSuccess("Run supprimé"); } }} className="hover:bg-gray-100 text-gray-600"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="text-xs text-gray-400">{new Date(run.createdAt).toLocaleString()}</div>
                      </div>

                      <div className="p-3 space-y-3">
                        <div className="grid gap-3">
                          {run.items.map((it) => {
                            const img = images.find((i) => i.id === it.imageId);
                            const boxCount = (it.boxes || []).length;
                            return (
                              <div key={it.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={statusVariant(it.status)}>{it.status}</Badge>
                                    <span className="max-w-[240px] truncate text-sm font-medium text-gray-800">{img?.name || it.imageId}</span>
                                    {boxCount > 0 ? (<Badge variant="secondary" className="ml-1">{boxCount} annotation{boxCount > 1 ? "s" : ""}</Badge>) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{img?.tag || "non taguée"}</span>
                                    <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => { setAnnotateRunId(run.id); setAnnotateItemId(it.id); setAnnotateOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Annoter</Button>
                                  </div>
                                </div>
                                {img ? (<AnomalyPreview src={img.dataUrl} alt={img.name} boxes={it.boxes || []} className="mb-2" height={200} />) : null}
                                {it.outputText ? (<ReportErrorBoundary fallbackText={it.outputText}><StructuredAnalysisView text={it.outputText} imageLookup={lookup} /></ReportErrorBoundary>) : it.error ? (<p className="text-sm text-red-600">{it.error}</p>) : (<p className="text-sm text-gray-400">Traitement en cours…</p>)}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {(run.status === "running" || run.status === "queued") && (<Button size="sm" variant="secondary" onClick={async () => { await cancelRun(run.id); }} className="border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200">Annuler</Button>)}
                          {run.status === "failed" ? (<Button size="sm" variant="outline" onClick={() => setLogRunId(run.id)} className="border-gray-300 text-gray-700 hover:bg-gray-50">Voir le log</Button>) : null}
                          {run.status === "failed" ? (<Button variant="secondary" size="sm" onClick={async () => { await retryFailedItems(run.id, images); showSuccess("Relance des items en échec"); }}>Relancer les échecs</Button>) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* Onglet: runs agrégés */}
            <TabsContent value="prompt" className="space-y-4">
              {promptRuns.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun run "agrégé" pour le moment.</p>
              ) : (
                promptRuns.map((run) => {
                  const lookup = buildImageLookup(images, run.items);
                  return (
                    <div key={run.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-3">
                        <div className="flex items-center gap-2">
                          {run.status === "failed" ? (
                            <button type="button" onClick={() => setLogRunId(run.id)} className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400" title="Voir le log d'erreur">
                              <Badge variant={statusVariant(run.status)}>failed</Badge>
                            </button>
                          ) : (
                            <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                          )}
                          <span className="text-sm text-gray-700">Mode: Agrégé</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" disabled={run.status !== "succeeded"} onClick={async () => { await exportRunToPdf(run, images); }} className="border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FileText className="mr-2 h-4 w-4" />PDF</Button>
                          <Button size="sm" variant="outline" disabled={run.status !== "succeeded"} onClick={async () => { await exportRunToDocx(run, images); }} className="border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FileDown className="mr-2 h-4 w-4" />DOCX</Button>
                          <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Supprimer ce run ?")) { await deleteRun(run.id); showSuccess("Run supprimé"); } }} className="hover:bg-gray-100 text-gray-600"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="text-xs text-gray-400">{new Date(run.createdAt).toLocaleString()}</div>
                      </div>

                      <div className="p-3 space-y-4">
                        {/* Rapport structuré avec images intégrées inline */}
                        {run.outputText ? (
                          <ReportErrorBoundary fallbackText={run.outputText}><StructuredAnalysisView text={run.outputText} imageLookup={lookup} /></ReportErrorBoundary>
                        ) : run.error ? (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            Erreur: {run.error}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic p-4 text-center">Analyse en cours...</p>
                        )}

                        <div className="flex flex-wrap justify-end gap-2">
                          {(run.status === "running" || run.status === "queued") && (<Button size="sm" variant="secondary" onClick={async () => { await cancelRun(run.id); }} className="border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200">Annuler</Button>)}
                          {run.status === "failed" ? (<Button size="sm" variant="outline" onClick={() => setLogRunId(run.id)} className="border-gray-300 text-gray-700 hover:bg-gray-50">Voir le log</Button>) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <RunLogDialog run={logRun} open={!!logRunId} onOpenChange={(o) => (!o ? setLogRunId(null) : null)} />

      <AnnotateDialog
        open={annotateOpen}
        onOpenChange={(o) => setAnnotateOpen(o)}
        image={annotateImage || ({} as any)}
        initialBoxes={annotateBoxes}
        onSave={async (newBoxes) => {
          if (annotateRunId && annotateItemId) {
            await updateRunItemBoxes(annotateRunId, annotateItemId, newBoxes);
            showSuccess("Annotations enregistrées");
          }
        }}
      />
    </div>
  );
};

export default RunsTab;