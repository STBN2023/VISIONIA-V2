import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import Dropzone from "@/components/uploader/Dropzone";
import { showError, showSuccess } from "@/utils/toast";
import { getSettings, saveSettings, type APISettings } from "@/utils/settings";
import { deleteDataset, deleteOnnxModel, getDatasetManifest, importDatasetFromZip, storeOnnxModelToIdb, type DatasetManifest } from "@/utils/dataset";
import { calibrateOnVal } from "@/utils/inference";

const zipAccept = "application/zip,application/x-zip-compressed,.zip";
const onnxAccept = ".onnx,application/octet-stream";

type ClassMapping = Record<string, string>;

function defaultTagForClass(cls: string): string {
  const map: Record<string, string> = {
    major_crack: "fissure majeure",
    minor_crack: "fissure mineure",
    spalling: "structure",
    peeling: "revêtement (peeling)",
    stain: "humidité",
    algae: "moisissures",
    plain: "",
  };
  return map[cls] ?? cls;
}

function parseClassesOrder(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const DatasetCalibrateCard = () => {
  const [manifest, setManifest] = useState<DatasetManifest | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [mapping, setMapping] = useState<ClassMapping>({});
  const [datasetName, setDatasetName] = useState("");
  const [modelFileName, setModelFileName] = useState<string>("");
  const [inputSize, setInputSize] = useState<number>(224);
  const [classesOrderText, setClassesOrderText] = useState<string>("");
  const [onnxUrl, setOnnxUrl] = useState<string>("");

  const settings = useMemo(() => getSettings(), []);

  useEffect(() => {
    // Charger le dataset courant s'il existe
    const ref = settings.datasetRef;
    if (ref?.datasetId) {
      getDatasetManifest(ref.datasetId).then((m) => {
        if (m) {
          setManifest(m);
          setDatasetName(ref.datasetName || m.name);
          // préparer mapping par défaut
          const map: ClassMapping = {};
          m.classes.forEach((c) => (map[c] = defaultTagForClass(c)));
          const saved = settings.classMapping || {};
          // priorité aux valeurs sauvegardées
          const merged: ClassMapping = { ...map, ...saved };
          setMapping(merged);
          setClassesOrderText((settings.modelMeta?.classesOrder || m.classes).join("\n"));
          setInputSize(settings.modelMeta?.inputSize || 224);
        }
      });
    }
    // Pré-remplir l'URL si un modèle via URL est déjà enregistré
    if (settings.modelRef?.source === "url") {
      setOnnxUrl(settings.modelRef.value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalImages =
    (manifest?.splits.train.length || 0) +
    (manifest?.splits.val.length || 0) +
    (manifest?.splits.test.length || 0);

  const handleZipFiles = async (files: FileList | File[] | null) => {
    const file = files && (files[0] as File);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      showError("Veuillez sélectionner une archive .zip.");
      return;
    }
    setIsImporting(true);
    try {
      const m = await importDatasetFromZip(file, datasetName || undefined);
      setManifest(m);
      setDatasetName(m.name);
      // init mapping par défaut
      const map: ClassMapping = {};
      m.classes.forEach((c) => (map[c] = defaultTagForClass(c)));
      setMapping(map);
      setClassesOrderText(m.classes.join("\n"));
      showSuccess("Dataset importé avec succès.");
    } catch (e: any) {
      showError(e?.message || "Échec de l'import du dataset.");
    } finally {
      setIsImporting(false);
    }
  };

  const saveMapping = () => {
    if (!manifest) return;
    const next: Partial<APISettings> = {
      classMapping: mapping,
    };
    saveSettings(next);
    showSuccess("Mapping classes → tags enregistré.");
  };

  const saveModelMeta = () => {
    const classesOrder = parseClassesOrder(classesOrderText);
    if (classesOrder.length === 0) {
      showError("La liste des classes du modèle ne peut pas être vide.");
      return;
    }
    saveSettings({
      modelMeta: {
        inputSize,
        channelsOrder: "RGB",
        normalization: {
          scale: 1,
          mean: [0.485, 0.456, 0.406],
          std: [0.229, 0.224, 0.225],
        },
        classesOrder,
        version: `yolov5-cls-s-${inputSize} v1`,
      },
      inference: {
        threshold: getSettings().inference?.threshold ?? 0.6,
        backendPreference: getSettings().inference?.backendPreference ?? "webgpu",
        batchSize: 1,
        warmup: false,
      },
    });
    showSuccess("Métadonnées du modèle enregistrées.");
  };

  const verifyCoherence = () => {
    if (!manifest) {
      showError("Importez un dataset d'abord.");
      return;
    }
    const modelClasses = parseClassesOrder(classesOrderText);
    if (modelClasses.length === 0) {
      showError("Renseignez l'ordre des classes du modèle.");
      return;
    }
    const missingInModel = manifest.classes.filter((c) => !modelClasses.includes(c));
    const extraInModel = modelClasses.filter((c) => !manifest.classes.includes(c));
    if (missingInModel.length === 0 && extraInModel.length === 0) {
      showSuccess("Cohérence OK: classes dataset et modèle concordent.");
      return;
    }
    const msg = [
      missingInModel.length ? `Manque dans modèle: ${missingInModel.join(", ")}` : "",
      extraInModel.length ? `En trop dans modèle: ${extraInModel.join(", ")}` : "",
    ].filter(Boolean).join(" • ");
    showError(msg || "Incohérence de classes.");
  };

  const setModelFromUrl = () => {
    const url = onnxUrl.trim();
    if (!url) {
      showError("Renseignez une URL de modèle ONNX.");
      return;
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith("data:")) {
      showError("URL invalide (http(s) ou data:).");
      return;
    }
    saveSettings({ modelRef: { source: "url", value: url } });
    setModelFileName("");
    showSuccess("Modèle ONNX défini via URL.");
  };

  const clearModelSelection = () => {
    saveSettings({ modelRef: undefined, modelMeta: undefined });
    setOnnxUrl("");
    setModelFileName("");
    showSuccess("Modèle désélectionné.");
  };

  const handleCalibrate = async () => {
    setIsCalibrating(true);
    setCalibSummary("");
    try {
      const res = await calibrateOnVal(perClass);
      setCalibSummary(res.report);
      showSuccess(`Seuil calibré: ${res.threshold.toFixed(2)}`);
    } catch (e: any) {
      showError(e?.message || "Échec de la calibration.");
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleOnnxPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".onnx")) {
      showError("Sélectionnez un fichier .onnx.");
      return;
    }
    try {
      const { modelId } = await storeOnnxModelToIdb(f);
      setModelFileName(`${f.name} (id: ${modelId.slice(0, 8)}…)`);
      showSuccess("Modèle ONNX importé en local.");
    } catch (e: any) {
      showError(e?.message || "Échec de l'import du modèle ONNX.");
    }
  };

  const removeDataset = async () => {
    if (!manifest) return;
    await deleteDataset(manifest.id);
    setManifest(null);
    setMapping({});
    setDatasetName("");
    showSuccess("Dataset supprimé.");
  };

  const removeModel = async () => {
    const mr = getSettings().modelRef;
    if (mr?.source === "idb" && mr.value) {
      await deleteOnnxModel(mr.value);
    }
    clearModelSelection();
  };

  const [isCalibrating, setIsCalibrating] = useState(false);
  const [perClass, setPerClass] = useState<number>(10);
  const [calibSummary, setCalibSummary] = useState<string>("");

  return (
    <Card className="mt-6 rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
      <CardHeader>
        <CardTitle>Dataset & Calibrage (YOLOv5‑cls)</CardTitle>
        <CardDescription className="text-white/70">
          Importez un dataset .zip structuré en train/val/test par classe, configurez le mapping de classes vers vos tags, et chargez un modèle ONNX pour une future calibration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Import dataset */}
        <div className="space-y-3">
          <Label>Nom du dataset</Label>
          <Input
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            placeholder="ex: Inspection v1"
            className="bg-white/10 text-white placeholder:text-white/60"
          />
          <div className="grid gap-3 md:grid-cols-[1fr,220px]">
            <Dropzone
              accept={zipAccept}
              multiple={false}
              onFiles={handleZipFiles}
              label="Glissez-déposez votre dataset (.zip) ici"
              hint="structure: train/<classe>/..., val/<classe>/..., test/<classe>/..."
              className="w-full"
            />
            <div className="flex items-center">
              <Input
                type="file"
                accept={zipAccept}
                onChange={(e) => handleZipFiles(e.target.files)}
                className="bg-white/10 text-white file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-2 file:text-white"
              />
            </div>
          </div>
          {manifest ? (
            <div className="rounded-2xl border border-white/20 bg-white/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-white/80">
                  {manifest.name} • {manifest.classes.length} classes • {totalImages} images
                </div>
                <Button variant="ghost" className="text-red-200 hover:bg-red-500/10" onClick={removeDataset}>
                  Supprimer le dataset
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {manifest.classes.map((c) => (
                  <Badge key={c} variant="secondary">{c}</Badge>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-xs text-white/70">train</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {Object.entries(manifest.stats.train).map(([c, n]) => (
                      <li key={"tr-" + c} className="flex justify-between"><span>{c}</span><span className="text-white/80">{n}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-xs text-white/70">val</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {Object.entries(manifest.stats.val).map(([c, n]) => (
                      <li key={"va-" + c} className="flex justify-between"><span>{c}</span><span className="text-white/80">{n}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-xs text-white/70">test</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {Object.entries(manifest.stats.test).map(([c, n]) => (
                      <li key={"te-" + c} className="flex justify-between"><span>{c}</span><span className="text-white/80">{n}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-white/70">
              Conseil: sur iOS Safari, préférez l'import .zip (sélecteur de dossier limité).
            </p>
          )}
        </div>

        {/* Mapping classes -> tags */}
        {manifest ? (
          <div className="space-y-2">
            <Label>Mapping classes → tags</Label>
            <div className="rounded-2xl border border-white/20 bg-white/5">
              <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 md:grid-cols-3">
                {manifest.classes.map((cls) => (
                  <div key={cls} className="space-y-1">
                    <Label className="text-xs text-white/70">{cls}</Label>
                    <Input
                      value={mapping[cls] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [cls]: e.target.value }))}
                      placeholder={defaultTagForClass(cls) || "tag (vide = aucun)"
                      }
                      className="bg-white/10 text-white placeholder:text-white/50"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveMapping} className="backdrop-blur-sm">Enregistrer le mapping</Button>
            </div>
          </div>
        ) : null}

        {/* Modèle ONNX */}
        <div className="space-y-2">
          <Label>Modèle YOLOv5‑cls (ONNX)</Label>
          <div className="grid gap-3 md:grid-cols-[1fr,220px]">
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-white/70">inputSize</Label>
                  <Input
                    type="number"
                    min={64}
                    step={1}
                    value={inputSize}
                    onChange={(e) => setInputSize(Number(e.target.value || 224))}
                    className="bg-white/10 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-white/70">Ordre des classes (1 par ligne)</Label>
                  <textarea
                    value={classesOrderText}
                    onChange={(e) => setClassesOrderText(e.target.value)}
                    placeholder={manifest ? manifest.classes.join("\n") : "algae\nmajor_crack\n..."}
                    className="min-h-[120px] w-full rounded-md border border-white/20 bg-white/10 p-2 text-sm text-white placeholder:text-white/50"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveModelMeta} variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Enregistrer les métadonnées
                </Button>
                <Button onClick={verifyCoherence} variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Vérifier cohérence
                </Button>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3">
              <Input
                type="file"
                accept={onnxAccept}
                onChange={handleOnnxPick}
                className="bg-white/10 text-white file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-2 file:text-white"
              />
              {modelFileName ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/80">{modelFileName}</span>
                  <Button variant="ghost" className="text-red-200 hover:bg-red-500/10" onClick={removeModel}>
                    Supprimer
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-white/70">Chargez un .onnx (≤ ~20 Mo recommandé).</p>
              )}
              <div className="w-full space-y-2">
                <Label className="text-xs text-white/70">Ou URL du modèle</Label>
                <Input
                  value={onnxUrl}
                  onChange={(e) => setOnnxUrl(e.target.value)}
                  placeholder="https://…/model.onnx ou data:application/octet-stream;base64,..."
                  className="bg-white/10 text-white placeholder:text-white/60"
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={setModelFromUrl} className="border-white/30 bg-transparent text-white hover:bg-white/10">
                    Utiliser l'URL
                  </Button>
                  {onnxUrl ? (
                    <Button variant="ghost" onClick={clearModelSelection} className="text-white/90 hover:bg-white/10">
                      Effacer l'URL
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Calibration */}
        <div className="space-y-2">
          <Label>Calibration automatique (val)</Label>
          <div className="rounded-2xl border border-white/20 bg-white/5 p-3">
            <div className="grid gap-3 sm:grid-cols-[220px,1fr] sm:items-center">
              <div className="space-y-1">
                <Label className="text-xs text-white/70">Échantillons par classe (val)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={perClass}
                  onChange={(e) => setPerClass(Number(e.target.value || 10))}
                  className="bg-white/10 text-white"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button 
                  onClick={handleCalibrate} 
                  disabled={isCalibrating || (!modelFileName && !onnxUrl.trim())}
                  className="backdrop-blur-sm"
                  title={!modelFileName && !onnxUrl.trim() ? "Définissez un modèle (fichier ou URL) pour activer la calibration" : undefined}
                >
                  {isCalibrating ? "Calibration..." : "Calibrer automatiquement"}
                </Button>
              </div>
            </div>
            {calibSummary ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-xs text-white/80">{calibSummary}</pre>
            ) : null}
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={!manifest || isImporting} className="backdrop-blur-sm" title={!manifest ? 'Importez un dataset pour continuer' : 'Prêt'}>
          {isImporting ? "Import en cours..." : "Prêt"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default DatasetCalibrateCard;