import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectImage } from "@/utils/storage";
import type { Run } from "@/utils/runs";
import { cancelRun, retryFailedItems, deleteRun } from "@/utils/runs";
import { showSuccess } from "@/utils/toast";
import { FileText, Trash2 } from "lucide-react";
import { exportRunToPdf } from "@/utils/pdf";

const statusVariant = (s: string) =>
  s === "succeeded" ? "secondary" : s === "running" ? "default" : s === "queued" ? "outline" : s === "failed" ? "destructive" : "outline";

type Props = {
  runs: Run[];
  images: ProjectImage[];
};

const RunsTab = ({ runs, images }: Props) => {
  return (
    <div className="mt-4 text-white">
      <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardHeader>
          <CardTitle>Historique des analyses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {runs.length === 0 ? (
            <p className="text-sm text-white/80">Aucun run pour le moment.</p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                    <span className="text-sm">Mode: {run.mode === "aggregate" ? "Agrégé" : "Par image"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Export PDF (actif si réussi) */}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={run.status !== "succeeded"}
                      onClick={() => exportRunToPdf(run, images)}
                      className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm"
                      title={run.status === "succeeded" ? "Exporter en PDF" : "Disponible lorsque le run est terminé"}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Export PDF
                    </Button>

                    {/* Supprimer le run */}
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
                  {run.mode === "aggregate" ? (
                    <pre className="whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm">{run.outputText || "En cours..."}</pre>
                  ) : (
                    <div className="grid gap-3">
                      {run.items.map((it) => {
                        const img = images.find((i) => i.id === it.imageId);
                        return (
                          <div key={it.id} className="rounded-xl border border-white/15 bg-white/5 p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant={statusVariant(it.status)}>{it.status}</Badge>
                                <span className="text-sm font-medium truncate max-w-[240px]">{img?.name || it.imageId}</span>
                              </div>
                              <span className="text-xs text-white/70">{img?.tag || "non taguée"}</span>
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
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    {run.status === "running" || run.status === "queued" ? (
                      <Button variant="outline" size="sm" onClick={() => cancelRun(run.id)} className="border-white/30 text-white hover:bg-white/10">
                        Annuler
                      </Button>
                    ) : null}
                    {run.mode === "per_image" && run.status === "failed" ? (
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
        </CardContent>
      </Card>
    </div>
  );
};

export default RunsTab;