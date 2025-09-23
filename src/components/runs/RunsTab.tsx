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

  // Annotate modal state (uniquement pertinent pour les runs par image)
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
                <p className="text-sm text-white/80">Aucun run “par image” pour le moment.</p>
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
                            title="Voir le log d’erreur"
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
                                    title="Annoter l’image"
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Annoter
                                  </Button>
                                </div>
                              </div>
                              {it.outputText ? (
                                <pre className="whitespace-pre-wrap rounded-lg bg-white/5 p-3 text-sm">{it.outputText}</pre>
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
                            title="Voir le log d’erreur"
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

            {/* Onglet: runs agrégés (résultats du prompt) */}
            <TabsContent value="prompt" className="space-y-4">
              {promptRuns.length === 0 ? (
                <p className="text-sm text-white/80">Aucun run “agrégé” pour le moment.</p>
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
                            title="Voir le log d’erreur"
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

                    <div className="p-3 space-y-3">
                      <pre className="whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm">
                        {run.outputText || (run.error ? `Erreur: ${run.error}` : "En cours...")}
                      </pre>

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
                            title="Voir le log d’erreur"
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