import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectImage } from "@/utils/storage";
import type { Run } from "@/utils/runs";
import { cancelRun, retryFailedItems, deleteRun, updateRunItemBoxes } from "@/utils/runs";
import { showSuccess } from "@/utils/toast";
import { FileText, Trash2, Pencil } from "lucide-react";
import { exportRunToPdf } from "@/utils/pdf";
import RunLogDialog from "./RunLogDialog";
import AnnotateDialog from "./AnnotateDialog";
import AnomalyPreview from "./AnomalyPreview";
import { Badge as UIWebBadge } from "@/components/ui/badge";

// Ajout d'un composant pour afficher le JSON structuré par lots
const StructuredAnalysisView = ({ text }: { text: string }) => {
  const [parseError, setParseError] = useState<string | null>(null);

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
      
      // AUTO-REPAIR : Si le JSON est tronqué (pas de } finale), on tente de le fermer
      if (!jsonCandidate.endsWith('}')) {
        // On enlève tout ce qui dépasse après la dernière virgule ou structure probable
        // et on rajoute les fermetures nécessaires pour tenter de sauver les données
        jsonCandidate = jsonCandidate.trim();
        
        // Un petit hack pour fermer les structures ouvertes si coupure brutale
        // On rajoute suffisamment de fermetures pour espérer que JSON.parse passe
        jsonCandidate += '"]}]}'; 
      }

      const sanitized = jsonCandidate
        .replace(/\r?\n|\r/g, " ")
        .replace(/\t/g, " ");

      // On tente de parser. Si ça échoue, on essaie une version encore plus "réparée"
      try {
        return JSON.parse(sanitized);
      } catch (e) {
        // Deuxième tentative : on force la fermeture de l'objet principal
        return JSON.parse(sanitized + '}');
      }
    } catch (e) {
      return null;
    }
  }, [text]);

  if (!parsedData) {
    return (
      <div className="space-y-2">
        <pre className="whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm font-mono border border-white/10 opacity-80">{text}</pre>
        <div className="text-[10px] text-white/30 italic px-2">
          Note: Le format JSON reçu est malformé. L'IA a probablement inclus des retours à la ligne non autorisés.
        </div>
      </div>
    );
  }

  const data = parsedData;
  const hasContext = !!data.contexte_projet;
  const lots = data.lots || [];

  return (
    <div className="space-y-6 mt-2">
      {/* BLOC CONTEXTE PROJET */}
      {hasContext && (
        <div className="rounded-2xl border border-blue-400/40 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
          <h3 className="text-blue-300 font-bold uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.6)] animate-pulse"></span>
            Contexte de l'Audit
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-[12px]">
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white/40 block mb-0.5 text-[10px] uppercase font-semibold">Intervention</span>
              <span className="text-white font-bold">{data.contexte_projet.type_intervention}</span>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white/40 block mb-0.5 text-[10px] uppercase font-semibold">Phase</span>
              <span className="text-white font-bold">{data.contexte_projet.phase}</span>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white/40 block mb-0.5 text-[10px] uppercase font-semibold">Date</span>
              <span className="text-white font-bold">{data.contexte_projet.date_analysis || data.contexte_projet.date_analyse}</span>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white/40 block mb-0.5 text-[10px] uppercase font-semibold">DPE Initial</span>
              <span className="text-white font-bold">{data.contexte_projet.dpe_initial || "N/A"}</span>
            </div>
          </div>
          {data.contexte_projet.reserve_generale && (
            <div className="mt-4 pt-3 border-t border-white/10">
              <p className="text-[11px] text-white/70 italic leading-relaxed">
                <span className="font-bold text-blue-300 not-italic mr-1">RÉSERVE GÉNÉRALE :</span> {data.contexte_projet.reserve_generale}
              </p>
            </div>
          )}
        </div>
      )}

      {/* LISTE DES LOTS ET ANOMALIES */}
      {lots.map((lot: any, idx: number) => {
        // Nettoyage de la redondance "LOT : LOT"
        let lotName = lot.lot || "Général";
        const displayLot = lotName.toUpperCase().startsWith("LOT") ? lotName : `LOT : ${lotName}`;
        
        return (
          <div key={idx} className="rounded-2xl border border-white/20 bg-slate-900/90 overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="bg-white/15 px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-black text-white uppercase tracking-widest text-sm drop-shadow-sm">{displayLot}</h3>
              <UIWebBadge variant="secondary" className="bg-white/20 text-white border-white/30 font-bold px-3 py-1">
                {lot.anomalies?.length || 0} POINT(S) D'ATTENTION
              </UIWebBadge>
            </div>
            <div className="divide-y divide-white/10">
              {lot.anomalies?.map((ano: any, aIdx: number) => (
                <div key={aIdx} className="p-5 space-y-5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[10px] font-mono bg-blue-500/30 px-2 py-0.5 rounded border border-blue-400/30 text-blue-100 font-bold">{ano.id}</span>
                        <span className="text-[11px] text-white/60 font-medium">IMAGE: {ano.image_ref}</span>
                        <span className="text-[11px] text-white/40">•</span>
                        <span className="text-[11px] text-white/60 font-medium">LOCALISATION: {ano.localisation}</span>
                      </div>
                      <p className="text-base text-white font-bold leading-snug drop-shadow-sm">{ano.description}</p>
                    </div>
                    <div className="flex flex-col gap-2 items-end shrink-0">
                      {ano.impact_energetique && (
                        <span className={`text-[10px] px-3 py-1 rounded-md border-2 uppercase font-black shadow-lg ${
                          ano.impact_energetique === 'fort' || ano.impact_energetique === 'critique' 
                          ? 'bg-red-600/40 text-red-50 border-red-500/50' 
                          : 'bg-orange-600/40 text-orange-50 border-orange-500/50'
                        }`}>
                          {ano.impact_energetique}
                        </span>
                      )}
                      {ano.priorite_intervention && (
                        <span className="text-[10px] font-bold text-white/50 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase tracking-tighter">
                          {ano.priorite_intervention}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 bg-black/20 p-3 rounded-xl border border-white/5">
                      <div className="text-[10px] uppercase font-black text-white/40 tracking-wider">Analyse Technique</div>
                      <p className="text-sm text-white/90 leading-relaxed">{ano.analyse_technique}</p>
                    </div>
                    <div className="space-y-2 bg-red-950/20 p-3 rounded-xl border border-red-500/10">
                      <div className="text-[10px] uppercase font-black text-red-400/70 tracking-wider">Risques & Durabilité</div>
                      <p className="text-sm text-red-50/90 italic leading-relaxed">{ano.risques_associes}</p>
                    </div>
                  </div>
                  
                  <div className="bg-blue-600/20 p-4 rounded-xl border-2 border-blue-400/30 shadow-inner">
                    <div className="text-[10px] uppercase font-black text-blue-300 tracking-widest mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                      Prescription CCTP (Action MOE)
                    </div>
                    <p className="text-sm text-blue-50 font-bold leading-relaxed">
                      {ano.prescription_cctp}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                    <div className="flex flex-wrap gap-2">
                      {ano.references_normatives?.map((ref: string, rIdx: number) => (
                        <span key={rIdx} className="text-[10px] bg-slate-800 px-3 py-1 rounded border border-white/20 text-white font-bold shadow-sm">
                          {ref}
                        </span>
                      ))}
                    </div>
                    {ano.estimation_budgetaire && (
                      <div className="text-[11px] font-black text-green-300 bg-green-900/40 px-3 py-1.5 rounded-lg border-2 border-green-500/30 shadow-lg">
                        BUDGET EST. : {ano.estimation_budgetaire}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* SYNTHESE ENERGETIQUE FINALE */}
      {data.synthese_energetique && (
        <div className="rounded-2xl border border-green-400/40 bg-slate-900/95 p-6 shadow-2xl space-y-5 backdrop-blur-xl">
          <h3 className="text-green-400 font-black uppercase text-sm tracking-widest flex items-center gap-3">
            <span className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)]"></span>
            Synthèse & Recommandations Globales
          </h3>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3 bg-black/20 p-4 rounded-2xl border border-white/5">
              <div className="text-[11px] uppercase font-black text-white/40 tracking-widest border-b border-white/10 pb-2">Points Critiques</div>
              <ul className="space-y-2">
                {data.synthese_energetique.points_critiques?.map((p: string, i: number) => (
                  <li key={i} className="text-xs text-white/90 flex gap-2">
                    <span className="text-red-400 font-bold">•</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
              <div className="text-[11px] uppercase font-black text-white/40 tracking-widest border-b border-white/10 pb-2">Recommandations</div>
              <ul className="space-y-2">
                {data.synthese_energetique.recommandations_globales?.map((r: string, i: number) => (
                  <li key={i} className="text-xs text-white/90 flex gap-2">
                    <span className="text-green-400 font-bold">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {data.synthese_energetique.impact_dpe_estime && (
            <div className="pt-4 mt-2 border-t-2 border-green-500/20 flex justify-between items-center px-2">
              <span className="text-sm text-white/70 font-bold">IMPACT DPE ESTIMÉ :</span>
              <span className="text-xl font-black text-green-400 bg-green-500/10 px-4 py-1 rounded-full border border-green-500/30">
                {data.synthese_energetique.impact_dpe_estime}
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

  const [logRunId, setLogRunId] = useState<string | null>(null);
  const logRun = useMemo(() => runs.find((r) => r.id === logRunId) ?? null, [runs, logRunId]);

  // Annotate modal state (utilisé pour les deux modes)
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
    <div className="mt-4 text-white">
      <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardHeader>
          <CardTitle>Historique des analyses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="photos" className="w-full">
            <TabsList className="bg-white/10 text-white">
              <TabsTrigger value="photos">Photos & annotations</TabsTrigger>
              <TabsTrigger value="prompt">Résultats du prompt</TabsTrigger>
            </TabsList>

            {/* Onglet: runs par image (annotations) */}
            <TabsContent value="photos" className="space-y-4">
              {photoRuns.length === 0 ? (
                <p className="text-sm text-white/80">Aucun run "par image" pour le moment.</p>
              ) : (
                photoRuns.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
                      <div className="flex items-center gap-2">
                        {run.status === "failed" ? (
                          <button
                            type="button"
                            onClick={() => setLogRunId(run.id)}
                            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            title="Voir le log d'erreur"
                          >
                            <Badge variant={statusVariant(run.status)}>failed</Badge>
                          </button>
                        ) : (
                          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                        )}
                        <span className="text-sm">Mode: Par image</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={run.status !== "succeeded"}
                          onClick={async () => {
                            await exportRunToPdf(run, images);
                          }}
                          className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm disabled:opacity-50"
                          title={run.status === "succeeded" ? "Exporter en PDF" : "Disponible lorsque le run est terminé"}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Export PDF
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Supprimer ce run ?")) {
                              deleteRun(run.id);
                              showSuccess("Run supprimé");
                            }
                          }}
                          className="hover:bg-white/10"
                          title="Supprimer le run"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-xs text-white/70">{new Date(run.createdAt).toLocaleString()}</div>
                    </div>

                    <div className="p-3 space-y-3">
                      <div className="grid gap-3">
                        {run.items.map((it) => {
                          const img = images.find((i) => i.id === it.imageId);
                          const boxCount = (it.boxes || []).length;
                          return (
                            <div key={it.id} className="rounded-xl border border-white/15 bg-white/5 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant={statusVariant(it.status)}>{it.status}</Badge>
                                  <span className="max-w-[240px] truncate text-sm font-medium">
                                    {img?.name || it.imageId}
                                  </span>
                                  {boxCount > 0 ? (
                                    <Badge variant="secondary" className="ml-1">{boxCount} annotation{boxCount > 1 ? "s" : ""}</Badge>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-white/70">{img?.tag || "non taguée"}</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm"
                                    onClick={() => { setAnnotateRunId(run.id); setAnnotateItemId(it.id); setAnnotateOpen(true); }}
                                    title="Annoter l'image"
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Annoter
                                  </Button>
                                </div>
                              </div>

                              {/* Aperçu rectangles d'anomalie */}
                              {img ? (
                                <AnomalyPreview
                                  src={img.dataUrl}
                                  alt={img.name}
                                  boxes={it.boxes || []}
                                  className="mb-2"
                                  height={200}
                                />
                              ) : null}

                              {it.outputText ? (
                                <StructuredAnalysisView text={it.outputText} />
                              ) : it.error ? (
                                <p className="text-sm text-red-300">{it.error}</p>
                              ) : (
                                <p className="text-sm text-white/70">Traitement en cours…</p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        {(run.status === "running" || run.status === "queued") && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => cancelRun(run.id)}
                            className="border border-white/25 bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm"
                            title="Annuler ce run"
                          >
                            Annuler
                          </Button>
                        )}
                        {run.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLogRunId(run.id)}
                            className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm"
                            title="Voir le log d'erreur"
                          >
                            Voir le log
                          </Button>
                        ) : null}
                        {run.status === "failed" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              retryFailedItems(run.id, images);
                              showSuccess("Relance des items en échec");
                            }}
                            className="backdrop-blur-sm"
                          >
                            Relancer les échecs
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Onglet: runs agrégés (résultats du prompt + détails par image) */}
            <TabsContent value="prompt" className="space-y-4">
              {promptRuns.length === 0 ? (
                <p className="text-sm text-white/80">Aucun run "agrégé" pour le moment.</p>
              ) : (
                promptRuns.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
                      <div className="flex items-center gap-2">
                        {run.status === "failed" ? (
                          <button
                            type="button"
                            onClick={() => setLogRunId(run.id)}
                            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            title="Voir le log d'erreur"
                          >
                            <Badge variant={statusVariant(run.status)}>failed</Badge>
                          </button>
                        ) : (
                          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                        )}
                        <span className="text-sm">Mode: Agrégé</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={run.status !== "succeeded"}
                          onClick={async () => {
                            await exportRunToPdf(run, images);
                          }}
                          className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm disabled:opacity-50"
                          title={run.status === "succeeded" ? "Exporter en PDF" : "Disponible lorsque le run est terminé"}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Export PDF
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Supprimer ce run ?")) {
                              deleteRun(run.id);
                              showSuccess("Run supprimé");
                            }
                          }}
                          className="hover:bg-white/10"
                          title="Supprimer le run"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-xs text-white/70">{new Date(run.createdAt).toLocaleString()}</div>
                    </div>

                    <div className="p-3 space-y-4">
                      {/* Texte global optimisé pour JSON */}
                      {run.outputText ? (
                        <StructuredAnalysisView text={run.outputText} />
                      ) : run.error ? (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                          Erreur: {run.error}
                        </div>
                      ) : (
                        <p className="text-sm text-white/70 italic p-4 text-center">Analyse en cours...</p>
                      )}

                      {/* Détails par image si présents */}
                      {run.items && run.items.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-sm text-white/80">Détails par image</div>
                          <div className="grid gap-3">
                            {run.items.map((it) => {
                              const img = images.find((i) => i.id === it.imageId);
                              const boxCount = (it.boxes || []).length;
                              return (
                                <div key={it.id} className="rounded-xl border border-white/15 bg-white/5 p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary">ok</Badge>
                                      <span className="max-w-[240px] truncate text-sm font-medium">
                                        {img?.name || it.imageId}
                                      </span>
                                      {boxCount > 0 ? (
                                        <Badge variant="secondary" className="ml-1">{boxCount} annotation{boxCount > 1 ? "s" : ""}</Badge>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-white/70">{img?.tag || "non taguée"}</span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm"
                                        onClick={() => { setAnnotateRunId(run.id); setAnnotateItemId(it.id); setAnnotateOpen(true); }}
                                        title="Annoter l'image"
                                      >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Annoter
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Aperçu rectangles d'anomalie */}
                                  {img ? (
                                    <AnomalyPreview
                                      src={img.dataUrl}
                                      alt={img.name}
                                      boxes={it.boxes || []}
                                      className="mb-2"
                                      height={200}
                                    />
                                  ) : null}

                                  {it.outputText ? (
                                    <StructuredAnalysisView text={it.outputText} />
                                  ) : it.error ? (
                                    <p className="text-sm text-red-300">{it.error}</p>
                                  ) : (
                                    <p className="text-sm text-white/70">En cours…</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap justify-end gap-2">
                        {(run.status === "running" || run.status === "queued") && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => cancelRun(run.id)}
                            className="border border-white/25 bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm"
                            title="Annuler ce run"
                          >
                            Annuler
                          </Button>
                        )}
                        {run.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLogRunId(run.id)}
                            className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm"
                            title="Voir le log d'erreur"
                          >
                            Voir le log
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
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
        onSave={(newBoxes) => {
          if (annotateRunId && annotateItemId) {
            updateRunItemBoxes(annotateRunId, annotateItemId, newBoxes);
            showSuccess("Annotations enregistrées");
          }
        }}
      />
    </div>
  );
};

export default RunsTab;