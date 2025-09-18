import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectImage } from "@/utils/storage";
import type { Run } from "@/utils/runs";
import { cancelRun, retryFailedItems } from "@/utils/runs";
import { showSuccess } from "@/utils/toast";

const statusVariant = (s: string) =>
  s === "succeeded" ? "secondary" : s === "running" ? "default" : s === "queued" ? "outline" : s === "failed" ? "destructive" : "outline";

type Props = {
  runs: Run[];
  images: ProjectImage[];
};

const RunsTab = ({ runs, images }: Props) => {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Historique des analyses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun run pour le moment.</p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="rounded-md border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                    <span className="text-sm">Mode: {run.mode === "aggregate" ? "Agrégé" : "Par image"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</div>
                </div>
                <div className="p-3 space-y-3">
                  {run.mode === "aggregate" ? (
                    <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{run.outputText || "En cours..."}</pre>
                  ) : (
                    <div className="grid gap-3">
                      {run.items.map((it) => {
                        const img = images.find((i) => i.id === it.imageId);
                        return (
                          <div key={it.id} className="rounded-md border p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant={statusVariant(it.status)}>{it.status}</Badge>
                                <span className="text-sm font-medium truncate max-w-[240px]">{img?.name || it.imageId}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{img?.tag || "non taguée"}</span>
                            </div>
                            {it.outputText ? (
                              <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{it.outputText}</pre>
                            ) : it.error ? (
                              <p className="text-sm text-destructive">{it.error}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">Traitement en cours…</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    {run.status === "running" || run.status === "queued" ? (
                      <Button variant="outline" size="sm" onClick={() => cancelRun(run.id)}>
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