import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { getSettings } from "@/utils/settings";
import { getDatasetManifest, updateDatasetEntries, type DatasetManifest, type DatasetSplit } from "@/utils/dataset";
import { idbGet } from "@/utils/idb";
import { cn } from "@/lib/utils";

const splitOptions: DatasetSplit[] = ["train", "val", "test"];

const DatasetLabelerCard = () => {
  const [manifest, setManifest] = useState<DatasetManifest | null>(null);
  const [split, setSplit] = useState<DatasetSplit>("val");
  const [index, setIndex] = useState<number>(0);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [selectClass, setSelectClass] = useState<string>("");
  const [newClass, setNewClass] = useState<string>("");
  const [targetSplit, setTargetSplit] = useState<DatasetSplit | "keep">("keep");
  const [loading, setLoading] = useState(false);

  // Charger manifest courant via settings.datasetRef
  useEffect(() => {
    const s = getSettings();
    const ref = s.datasetRef;
    if (!ref?.datasetId) return;
    getDatasetManifest(ref.datasetId).then((m) => {
      if (m) {
        setManifest(m);
        // Si possible, rester sur 'val' sinon premier split non vide
        const defaultSplit: DatasetSplit =
          m.splits.val.length ? "val" : (m.splits.train.length ? "train" : "test");
        setSplit(defaultSplit);
        setIndex(0);
      }
    });
  }, []);

  // Entrées du split courant
  const entries = useMemo(() => {
    if (!manifest) return [];
    return manifest.splits[split] as DatasetManifest["splits"][DatasetSplit];
  }, [manifest, split]);

  const current = entries[index];

  // Charger l'image affichée
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!current) {
        setDataUrl("");
        setSelectClass("");
        setNewClass("");
        setTargetSplit("keep");
        return;
      }
      const url = await idbGet(current.blobKey);
      if (mounted) {
        setDataUrl(url || "");
        setSelectClass(current.className || "");
        setNewClass("");
        setTargetSplit("keep");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Raccourcis: 1..9 assignent classes[0..8] et sauvegardent
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!manifest || !current) return;
    if (e.target && (e.target as HTMLElement).tagName.match(/INPUT|TEXTAREA|SELECT/i)) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n <= 0) return;
    const idx = n - 1;
    const classes = manifest.classes;
    if (idx < classes.length) {
      e.preventDefault();
      const cls = classes[idx];
      handleSave(cls, "keep", true);
    }
  }, [manifest, current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const next = () => setIndex((i) => Math.min(i + 1, Math.max(0, entries.length - 1)));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  async function handleSave(cls?: string, splitMove: DatasetSplit | "keep" = "keep", silent = false) {
    if (!manifest || !current) return;
    const chosenClass = (cls ?? (newClass.trim() || selectClass)).trim();
    if (!chosenClass) {
      showError("Choisissez une classe ou saisissez-en une nouvelle.");
      return;
    }
    const newSplit = splitMove === "keep" ? undefined : splitMove;

    setLoading(true);
    try {
      const m = await updateDatasetEntries(manifest.id, [
        { id: current.id, className: chosenClass, split: newSplit as DatasetSplit | undefined },
      ]);
      setManifest(m);

      // Si déplacement de split, l'index courant n'est plus valide -> rester sur même index (image suivante)
      if (newSplit && newSplit !== split) {
        // ne pas incrementer index, la liste s'est raccourcie à cette position
        setIndex((i) => Math.min(i, Math.max(0, (m.splits[split] as any[]).length - 1)));
      } else {
        // image suivante si dispo
        setIndex((i) => Math.min(i + 1, Math.max(0, (m.splits[split] as any[]).length - 1)));
      }

      if (!silent) showSuccess(`Image classée “${chosenClass}”${newSplit ? ` → ${newSplit}` : ""}.`);
      setNewClass("");
    } catch (e: any) {
      showError(e?.message || "Échec de la mise à jour.");
    } finally {
      setLoading(false);
    }
  }

  const totalInSplit = entries.length;
  const summary = useMemo(() => {
    if (!manifest) return [];
    const stats = manifest.stats[split];
    return Object.entries(stats).sort((a, b) => b[1] - a[1]); // par fréquence
  }, [manifest, split]);

  return (
    <Card className="mt-6 rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
      <CardHeader>
        <CardTitle>Classification manuelle du dataset</CardTitle>
        <CardDescription className="text-white/70">
          Parcourez les images de votre dataset pour ajuster les classes et, si besoin, déplacer entre les splits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!manifest ? (
          <p className="text-sm text-white/80">Aucun dataset sélectionné. Importez un dataset dans “Dataset & Calibrage”.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[220px,1fr,auto] sm:items-center">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-white/70">Split</Label>
                <Select
                  value={split}
                  onValueChange={(v) => {
                    setSplit(v as DatasetSplit);
                    setIndex(0);
                  }}
                >
                  <SelectTrigger className="w-[160px] bg-white/10 text-white">
                    <SelectValue placeholder="Split" />
                  </SelectTrigger>
                  <SelectContent>
                    {splitOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-white/80">
                {totalInSplit} image{totalInSplit > 1 ? "s" : ""} dans {split}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={prev}
                  disabled={!current || index === 0}
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  Précédente
                </Button>
                <Button
                  variant="outline"
                  onClick={next}
                  disabled={!current || index >= totalInSplit - 1}
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  Suivante
                </Button>
              </div>
            </div>

            {current ? (
              <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
                <div className="rounded-2xl border border-white/20 bg-black/30 p-2">
                  {dataUrl ? (
                    <img
                      src={dataUrl}
                      alt={current.fileName}
                      className="mx-auto max-h-[60vh] w-full rounded-xl object-contain"
                    />
                  ) : (
                    <div className="flex h-[320px] items-center justify-center text-white/70">
                      Chargement…
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-white/20 bg-white/5 p-3">
                    <p className="mb-2 text-xs text-white/70">Fichier</p>
                    <div className="truncate text-sm">{current.fileName}</div>
                    <div className="text-xs text-white/70">
                      {Math.round(current.size / 1024)} Ko • {current.mime}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-white/20 bg-white/5 p-3">
                    <Label className="text-xs text-white/70">Classe</Label>
                    <div className="grid gap-2 sm:grid-cols-[1fr]">
                      <Select value={selectClass} onValueChange={setSelectClass}>
                        <SelectTrigger className="bg-white/10 text-white">
                          <SelectValue placeholder="Choisir une classe" />
                        </SelectTrigger>
                        <SelectContent>
                          {manifest.classes.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Input
                          value={newClass}
                          onChange={(e) => setNewClass(e.target.value)}
                          placeholder="Ou saisir une nouvelle classe"
                          className="bg-white/10 text-white placeholder:text-white/60"
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-white/60">
                      Astuce: utilisez 1–9 pour classer rapidement selon la liste des classes.
                    </p>
                  </div>

                  <div className="space-y-2 rounded-xl border border-white/20 bg-white/5 p-3">
                    <Label className="text-xs text-white/70">Déplacer vers un split</Label>
                    <Select value={targetSplit} onValueChange={(v) => setTargetSplit(v as DatasetSplit | "keep")}>
                      <SelectTrigger className="bg-white/10 text-white">
                        <SelectValue placeholder="Garder dans ce split" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keep">Garder</SelectItem>
                        <SelectItem value="train">train</SelectItem>
                        <SelectItem value="val">val</SelectItem>
                        <SelectItem value="test">test</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleSave(undefined, targetSplit)}
                      disabled={loading}
                      className="backdrop-blur-sm"
                    >
                      {loading ? "Enregistrement…" : "Enregistrer et suivant"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={next}
                      disabled={index >= totalInSplit - 1}
                      className="text-white/90 hover:bg-white/10"
                    >
                      Passer
                    </Button>
                  </div>

                  <div className="rounded-xl border border-white/20 bg-white/5 p-3">
                    <p className="mb-2 text-xs text-white/70">Répartition ({split})</p>
                    <div className="flex flex-wrap gap-2">
                      {summary.length === 0 ? (
                        <span className="text-xs text-white/60">Aucune classe</span>
                      ) : summary.map(([c, n]) => (
                        <Badge
                          key={c}
                          variant={selectClass === c ? "default" : "secondary"}
                          className={cn(selectClass === c ? "" : "bg-white/15 text-white")}
                          onClick={() => setSelectClass(c)}
                        >
                          {c} • {n}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/20 bg-white/5 p-6 text-sm text-white/80">
                Aucune image dans ce split.
              </div>
            )}
          </>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <div className="text-xs text-white/70">
          Les changements mettent à jour le manifest et les statistiques du dataset.
        </div>
        <div className="flex items-center gap-2">
          {manifest ? (
            <>
              <div className="text-xs text-white/70">{manifest.name}</div>
              <Badge variant="outline" className="border-white/30 bg-white/10 text-white">
                {manifest.classes.length} classes
              </Badge>
            </>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
};

export default DatasetLabelerCard;