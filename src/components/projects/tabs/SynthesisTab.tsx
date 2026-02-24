import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProjectImage } from "@/utils/storage";
import type { Run } from "@/utils/runs";
import { ANOMALY_COLORS, guessType, titleForType, type AnomalyType } from "@/utils/anomaly-colors";
import {
  BarChart3,
  ImageIcon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Tag,
  Layers,
} from "lucide-react";

type Props = {
  runs: Run[];
  images: ProjectImage[];
  tags: string[];
};

type AnomalyStats = {
  type: AnomalyType;
  count: number;
  color: string;
  title: string;
};

function extractAnomaliesFromRuns(runs: Run[]): AnomalyStats[] {
  const succeededRuns = runs.filter((r) => r.status === "succeeded");
  const typeCounts = new Map<AnomalyType, number>();

  for (const run of succeededRuns) {
    // From items boxes
    for (const item of run.items) {
      for (const box of item.boxes || []) {
        const t = guessType(box.label) as AnomalyType;
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      }
    }

    // From outputText JSON (lots > anomalies)
    const text = run.outputText?.trim();
    if (text) {
      try {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const json = JSON.parse(text.substring(start, end + 1));
          if (Array.isArray(json?.lots)) {
            for (const lot of json.lots) {
              for (const ano of lot.anomalies || []) {
                const desc = ano.description || ano.label || "";
                const t = guessType(desc);
                typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
              }
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return Array.from(typeCounts.entries())
    .map(([type, count]) => ({
      type,
      count,
      color: ANOMALY_COLORS[type],
      title: titleForType(type),
    }))
    .sort((a, b) => b.count - a.count);
}

const SynthesisTab = ({ runs, images, tags }: Props) => {
  const succeededRuns = useMemo(
    () => runs.filter((r) => r.status === "succeeded"),
    [runs]
  );
  const failedRuns = useMemo(
    () => runs.filter((r) => r.status === "failed"),
    [runs]
  );
  const runningRuns = useMemo(
    () => runs.filter((r) => r.status === "running" || r.status === "queued"),
    [runs]
  );

  const totalAnnotations = useMemo(() => {
    let count = 0;
    for (const run of succeededRuns) {
      for (const item of run.items) {
        count += (item.boxes || []).length;
      }
    }
    return count;
  }, [succeededRuns]);

  const anomalyStats = useMemo(
    () => extractAnomaliesFromRuns(runs),
    [runs]
  );

  const totalAnomalies = useMemo(
    () => anomalyStats.reduce((sum, s) => sum + s.count, 0),
    [anomalyStats]
  );

  const maxAnomalyCount = useMemo(
    () => Math.max(1, ...anomalyStats.map((s) => s.count)),
    [anomalyStats]
  );

  const imagesWithDefects = useMemo(() => {
    const ids = new Set<string>();
    for (const run of succeededRuns) {
      for (const item of run.items) {
        if ((item.boxes || []).length > 0) {
          ids.add(item.imageId);
        }
      }
    }
    return ids.size;
  }, [succeededRuns]);

  const tagDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const img of images) {
      const t = img.tag || "Non tagué";
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [images]);

  const lastRunDate = useMemo(() => {
    if (succeededRuns.length === 0) return null;
    return new Date(succeededRuns[0].createdAt);
  }, [succeededRuns]);

  return (
    <div className="mt-4 space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20">
              <ImageIcon className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-black">{images.length}</p>
              <p className="text-xs text-white/60">Images</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/20">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-black">{succeededRuns.length}</p>
              <p className="text-xs text-white/60">
                Analyse{succeededRuns.length > 1 ? "s" : ""} terminée
                {succeededRuns.length > 1 ? "s" : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/20">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-black">{totalAnomalies}</p>
              <p className="text-xs text-white/60">
                Anomalie{totalAnomalies > 1 ? "s" : ""} détectée
                {totalAnomalies > 1 ? "s" : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20">
              <Layers className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-black">{totalAnnotations}</p>
              <p className="text-xs text-white/60">
                Annotation{totalAnnotations > 1 ? "s" : ""} (bounding boxes)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20">
              <Tag className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-black">{tags.length}</p>
              <p className="text-xs text-white/60">Tags projet</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/20">
              <AlertTriangle className="h-6 w-6 text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-black">
                {imagesWithDefects}
                <span className="text-sm font-normal text-white/50">
                  /{images.length}
                </span>
              </p>
              <p className="text-xs text-white/60">Images avec anomalies</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20">
              <Clock className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-bold">
                {lastRunDate
                  ? lastRunDate.toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
              <p className="text-xs text-white/60">Dernière analyse</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly breakdown chart */}
      <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Répartition des anomalies par type
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anomalyStats.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">
              Aucune anomalie détectée. Lancez une analyse pour voir les
              statistiques.
            </p>
          ) : (
            <div className="space-y-3">
              {anomalyStats.map((stat) => (
                <div key={stat.type} className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: stat.color }}
                  />
                  <span className="w-32 shrink-0 text-sm font-medium">
                    {stat.title}
                  </span>
                  <div className="flex-1">
                    <div className="h-6 w-full overflow-hidden rounded-lg bg-white/5">
                      <div
                        className="flex h-full items-center rounded-lg px-2 text-xs font-bold transition-all duration-500"
                        style={{
                          width: `${Math.max(
                            8,
                            (stat.count / maxAnomalyCount) * 100
                          )}%`,
                          backgroundColor: stat.color + "40",
                          borderLeft: `3px solid ${stat.color}`,
                        }}
                      >
                        {stat.count}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tag distribution */}
      <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Répartition des images par tag
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tagDistribution.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">
              Aucune image dans le projet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {tagDistribution.map(({ tag, count }) => (
                <div
                  key={tag}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2"
                >
                  <Badge
                    variant={tag === "Non tagué" ? "outline" : "secondary"}
                    className={
                      tag === "Non tagué"
                        ? "border-white/30 text-white/50"
                        : ""
                    }
                  >
                    {tag}
                  </Badge>
                  <span className="text-lg font-black">{count}</span>
                  <span className="text-xs text-white/40">
                    image{count > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run history summary */}
      {runs.length > 0 && (
        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardHeader>
            <CardTitle>Historique des analyses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runs.slice(0, 10).map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        run.status === "succeeded"
                          ? "secondary"
                          : run.status === "failed"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {run.status === "succeeded"
                        ? "Terminé"
                        : run.status === "failed"
                        ? "Échoué"
                        : run.status === "running"
                        ? "En cours"
                        : run.status}
                    </Badge>
                    <span className="text-sm">
                      {run.mode === "aggregate" ? "Agrégé" : "Par image"}
                    </span>
                    <span className="text-xs text-white/40">
                      {run.items.length} image
                      {run.items.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="text-xs text-white/50">
                    {new Date(run.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
            {failedRuns.length > 0 && (
              <p className="mt-3 text-xs text-red-300/70">
                ⚠ {failedRuns.length} analyse
                {failedRuns.length > 1 ? "s" : ""} en échec
              </p>
            )}
            {runningRuns.length > 0 && (
              <p className="mt-1 text-xs text-amber-300/70">
                ⏳ {runningRuns.length} analyse
                {runningRuns.length > 1 ? "s" : ""} en cours
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SynthesisTab;
