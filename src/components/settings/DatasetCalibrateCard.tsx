import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Dropzone from "@/components/uploader/Dropzone";
import { showError, showSuccess } from "@/utils/toast";
import { getSettings, saveSettings, type Settings } from "@/utils/settings";
import { deleteDataset, deleteOnnxModel, getDatasetManifest, importDatasetFromZip, storeOnnxModelToIdb, type DatasetManifest } from "@/utils/dataset";
import { calibrateOnVal, classifyDataUrl } from "@/utils/inference";
import { blobToDataUrl, compressImageToBlob } from "@/utils/image-compress";
import { CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

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

// --- Pastille de statut ---
type StatusLevel = "ok" | "warn" | "error";

const StatusDot = ({ level, label }: { level: StatusLevel; label: string }) => {
  const icon =
    level === "ok" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
    level === "warn" ? <AlertCircle className="h-4 w-4 text-amber-500" /> :
    <XCircle className="h-4 w-4 text-red-500" />;

  const bg =
    level === "ok" ? "bg-green-50 border-green-200 text-green-700" :
    level === "warn" ? "bg-amber-50 border-amber-200 text-amber-700" :
    "bg-red-50 border-red-200 text-red-700";

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${bg}`}>
      {icon}
      {label}
    </div>
  );
};

const DatasetCalibrateCard = () => {
  const [manifest, setManifest] = useState<DatasetManifest | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [mapping, setMapping] = useState<ClassMapping>({});
  const [datasetName, setDatasetName] = useState("");
  const [modelFileName, setModelFileName] = useState<string>("");
  const [inputSize, setInputSize] = useState<number>(224);
  const [classesOrderText, setClassesOrderText] = useState<string>("");
  const [onnxUrl, setOnnxUrl] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const settings = useMemo(() => getSettings(), []);

  useEffect(() => {
    const ref = settings.datasetRef;
    if (ref?.datasetId) {
      getDatasetManifest(ref.datasetId).then((m) => {
        if (m) {
          setManifest(m);
          setDatasetName(ref.datasetName || m.name);
          const map: ClassMapping = {};
          m.classes.forEach((c) => (map[c] = defaultTagForClass(c)));
          const saved = settings.classMapping || {};
          const merged: ClassMapping = { ...map, ...saved };
          setMapping(merged);
          setClassesOrderText((settings.modelMeta?.classesOrder || m.classes).join("\n"));
          setInputSize(settings.modelMeta?.inputSize || 224);
        }
      });
    }
    if (settings.modelRef?.source === "url") {
      setOnnxUrl(settings.modelRef.value);
    }
    if (settings.modelRef?.source === "idb" && settings.modelRef.value) {
      const id = settings.modelRef.value;
      setModelFileName(`Modèle local (id: ${id.slice(0, 8)}…)`);
    }
    if (!settings.datasetRef?.datasetId && settings.modelMeta?.classesOrder) {
      setClassesOrderText(settings.modelMeta.classesOrder.join("\n"));
      setInputSize(settings.modelMeta.inputSize || 224);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Statuts calculés ---
  const hasModel = !!(modelFileName || onnxUrl.trim() || settings.modelRef);
  const hasClasses = !!(settings.modelMeta?.classesOrder?.length);
  const hasMapping = !!(settings.classMapping && Object.keys(settings.classMapping).length > 0);
  const hasCalibration = !!(settings.calibrationReport?.thresholdRecommended);
  const hasDataset = !!manifest;

  const modelStatus: StatusLevel = hasModel ? "ok" : "error";
  const classesStatus: StatusLevel = hasClasses ? "ok" : "error";
  const mappingStatus: StatusLevel = hasMapping ? "ok" : hasClasses ? "warn" : "error";
  const calibrationStatus: StatusLevel = hasCalibration ? "ok" : "warn";
  const overallReady = hasModel && hasClasses;

  const totalImages =
    (manifest?.splits.train.length || 0) +
    (manifest?.splits.val.length || 0) +
    (manifest?.splits.test.length || 0);

  // --- Handlers ---
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
    if (!hasClasses) return;
    saveSettings({ classMapping: mapping });
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
        normalization: { scale: 1, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
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
    // Auto-generate default mapping if none exists
    const currentMapping = getSettings().classMapping || {};
    if (Object.keys(currentMapping).length === 0) {
      const autoMap: ClassMapping = {};
      classesOrder.forEach((c) => (autoMap[c] = defaultTagForClass(c)));
      saveSettings({ classMapping: autoMap });
      setMapping(autoMap);
    }
    showSuccess("Métadonnées du modèle enregistrées.");
  };

  const setModelFromUrl = () => {
    const url = onnxUrl.trim();
    if (!url) { showError("Renseignez une URL de modèle ONNX."); return; }
    if (!/^https?:\/\//i.test(url) && !url.startsWith("data:")) {
      showError("URL invalide (http(s) ou data:)."); return;
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

  const handleOnnxPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".onnx")) { showError("Sélectionnez un fichier .onnx."); return; }
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
    if (mr?.source === "idb" && mr.value) { await deleteOnnxModel(mr.value); }
    clearModelSelection();
  };

  const [isCalibrating, setIsCalibrating] = useState(false);
  const [perClass, setPerClass] = useState<number>(10);
  const [calibSummary, setCalibSummary] = useState<string>("");

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

  const [testImage, setTestImage] = useState<string>("");
  const [testResult, setTestResult] = useState<{ label: string; score: number; probs: number[] } | null>(null);

  const handleTestFile = async (files: FileList | File[] | null) => {
    const f = files && (files[0] as File);
    if (!f) return;
    try {
      const blob = await compressImageToBlob(f, { maxWidth: 1024 });
      const url = await blobToDataUrl(blob);
      setTestImage(url);
      setTestResult(null);
      const res = await classifyDataUrl(url);
      setTestResult({ label: res.topLabel, score: res.topScore, probs: res.probs });
    } catch (e: any) {
      showError(e?.message || "Erreur de classification test");
    }
  };

  const verifyCoherence = () => {
    if (!manifest) { showError("Importez un dataset d'abord."); return; }
    const modelClasses = parseClassesOrder(classesOrderText);
    if (modelClasses.length === 0) { showError("Renseignez l'ordre des classes du modèle."); return; }
    const missingInModel = manifest.classes.filter((c) => !modelClasses.includes(c));
    const extraInModel = modelClasses.filter((c) => !manifest.classes.includes(c));
    if (missingInModel.length === 0 && extraInModel.length === 0) {
      showSuccess("Cohérence OK: classes dataset et modèle concordent."); return;
    }
    const msg = [
      missingInModel.length ? `Manque dans modèle: ${missingInModel.join(", ")}` : "",
      extraInModel.length ? `En trop dans modèle: ${extraInModel.join(", ")}` : "",
    ].filter(Boolean).join(" • ");
    showError(msg || "Incohérence de classes.");
  };

  return (
    <Card className="mt-6 rounded-3xl border-gray-200 bg-white shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-gray-800">Modèle ONNX & Classification</CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Configurez votre modèle de classification pour le pré-filtrage automatique des images.
        </p>

        {/* === BANDEAU DE STATUT GLOBAL === */}
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusDot level={modelStatus} label={hasModel ? "Modèle chargé" : "Modèle manquant"} />
          <StatusDot level={classesStatus} label={hasClasses ? `${settings.modelMeta!.classesOrder!.length} classes` : "Classes non définies"} />
          <StatusDot level={mappingStatus} label={hasMapping ? "Mapping OK" : hasClasses ? "Mapping par défaut" : "Mapping absent"} />
          <StatusDot level={calibrationStatus} label={hasCalibration ? `Seuil: ${settings.calibrationReport!.thresholdRecommended!.toFixed(2)}` : "Seuil par défaut (0.6)"} />
        </div>

        {overallReady && (
          <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700 font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Prêt pour l'inférence — le pré-filtrage ONNX est opérationnel.
          </div>
        )}
        {!overallReady && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 font-medium flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Configuration incomplète — chargez un modèle et définissez les classes pour activer le pré-filtrage.
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">

        {/* ============================================ */}
        {/* SECTION 1 : MODÈLE ONNX (essentiel)         */}
        {/* ============================================ */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${hasModel ? "bg-green-500" : "bg-red-400"}`} />
            1. Charger le modèle ONNX
          </h3>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            {/* Fichier local */}
            <div className="space-y-2">
              <Label className="text-gray-600 text-xs font-medium">Fichier local (.onnx)</Label>
              <Input
                type="file"
                accept={onnxAccept}
                onChange={handleOnnxPick}
                className="bg-white border-gray-300 text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-blue-700 file:font-medium"
              />
              {modelFileName && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">{modelFileName}</Badge>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 h-7 px-2" onClick={removeModel}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Ou URL */}
            <div className="space-y-2">
              <Label className="text-gray-600 text-xs font-medium">Ou URL distante</Label>
              <div className="flex gap-2">
                <Input
                  value={onnxUrl}
                  onChange={(e) => setOnnxUrl(e.target.value)}
                  placeholder="https://…/model.onnx"
                  className="bg-white border-gray-300 text-gray-700 placeholder:text-gray-400 flex-1"
                />
                <Button variant="outline" onClick={setModelFromUrl} className="border-gray-300 text-gray-700 hover:bg-gray-100 shrink-0">
                  Appliquer
                </Button>
                {onnxUrl && (
                  <Button variant="ghost" onClick={clearModelSelection} className="text-gray-500 hover:bg-gray-100 shrink-0">
                    Effacer
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================ */}
        {/* SECTION 2 : MÉTADONNÉES DU MODÈLE            */}
        {/* ============================================ */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${hasClasses ? "bg-green-500" : "bg-red-400"}`} />
            2. Métadonnées du modèle
          </h3>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-[140px,1fr]">
              <div className="space-y-1">
                <Label className="text-gray-600 text-xs font-medium">Input size</Label>
                <Input
                  type="number"
                  min={64}
                  step={1}
                  value={inputSize}
                  onChange={(e) => setInputSize(Number(e.target.value || 224))}
                  className="bg-white border-gray-300 text-gray-700"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-600 text-xs font-medium">Ordre des classes (1 par ligne)</Label>
                <textarea
                  value={classesOrderText}
                  onChange={(e) => setClassesOrderText(e.target.value)}
                  placeholder={"algae\nmajor_crack\nminor_crack\npeeling\nplain\nspalling\nstain"}
                  className="min-h-[140px] w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveModelMeta} className="bg-blue-600 hover:bg-blue-700 text-white">
                Enregistrer les métadonnées
              </Button>
            </div>
          </div>
        </div>

        {/* ============================================ */}
        {/* SECTION 3 : MAPPING CLASSES → TAGS            */}
        {/* ============================================ */}
        {hasClasses && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${hasMapping ? "bg-green-500" : "bg-amber-400"}`} />
              3. Mapping classes → tags
            </h3>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {(settings.modelMeta?.classesOrder || []).map((cls) => (
                  <div key={cls} className="space-y-1">
                    <Label className="text-xs text-gray-500 font-medium">{cls}</Label>
                    <Input
                      value={mapping[cls] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [cls]: e.target.value }))}
                      placeholder={defaultTagForClass(cls) || "tag (vide = aucun)"}
                      className="bg-white border-gray-300 text-gray-700 placeholder:text-gray-400"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-3">
                <Button onClick={saveMapping} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Enregistrer le mapping
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* SECTION 4 : TEST RAPIDE                       */}
        {/* ============================================ */}
        {hasModel && hasClasses && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              4. Test rapide
            </h3>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Dropzone
                  accept="image/*"
                  multiple={false}
                  onFiles={handleTestFile}
                  label="Tester une image"
                  hint="Glissez ou cliquez"
                  className="h-28"
                />
                {testImage && (
                  <div className="flex gap-4 rounded-xl border border-gray-200 bg-white p-3">
                    <img src={testImage} alt="Test" className="h-20 w-20 rounded-lg object-cover" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-gray-700">Résultat :</p>
                      {testResult ? (
                        <>
                          <Badge variant={testResult.label === "plain" ? "secondary" : "destructive"}>
                            {testResult.label}
                          </Badge>
                          <p className="text-xs text-gray-500">Confiance: {(testResult.score * 100).toFixed(1)}%</p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 animate-pulse">Analyse...</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* SECTION AVANCÉE : DATASET & CALIBRATION       */}
        {/* ============================================ */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors w-full py-2 border-t border-gray-200 mt-2">
              {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className={`w-2 h-2 rounded-full ${hasCalibration ? "bg-green-500" : "bg-amber-400"}`} />
              Avancé — Dataset & Calibration
              {!hasCalibration && <span className="text-xs font-normal text-amber-500 ml-2">(optionnel)</span>}
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-5 pt-4">
            {/* Dataset import */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Dataset de calibration</h4>
              <p className="text-xs text-gray-400">
                Le dataset sert uniquement à calibrer le seuil de confiance. Une fois calibré, il n'est plus nécessaire.
              </p>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-gray-600 text-xs font-medium">Nom du dataset</Label>
                    <Input
                      value={datasetName}
                      onChange={(e) => setDatasetName(e.target.value)}
                      placeholder="ex: Inspection v1"
                      className="bg-white border-gray-300 text-gray-700 placeholder:text-gray-400"
                    />
                  </div>
                  <Input
                    type="file"
                    accept={zipAccept}
                    onChange={(e) => handleZipFiles(e.target.files)}
                    className="bg-white border-gray-300 text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-blue-700 file:font-medium flex-1"
                  />
                </div>

                {manifest ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusDot level="ok" label={`${manifest.name} — ${manifest.classes.length} classes, ${totalImages} images`} />
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 h-7" onClick={removeDataset}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {manifest.classes.map((c) => (
                        <Badge key={c} variant="secondary" className="bg-gray-100 text-gray-600 border-gray-200 text-xs">{c}</Badge>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
                      {(["train", "val", "test"] as const).map((split) => (
                        <div key={split} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                          <p className="text-gray-400 font-semibold uppercase text-[10px] mb-1">{split}</p>
                          {Object.entries(manifest.stats[split]).map(([c, n]) => (
                            <div key={`${split}-${c}`} className="flex justify-between text-gray-600">
                              <span>{c}</span><span className="font-medium">{n}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Aucun dataset chargé.</p>
                )}
              </div>
            </div>

            {/* Vérification cohérence */}
            {manifest && hasClasses && (
              <div className="flex justify-start">
                <Button variant="outline" onClick={verifyCoherence} className="border-gray-300 text-gray-700 hover:bg-gray-100">
                  Vérifier cohérence dataset ↔ modèle
                </Button>
              </div>
            )}

            {/* Calibration */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Calibration automatique du seuil</h4>
              <p className="text-xs text-gray-400">
                Utilise le split <strong>val</strong> du dataset pour trouver le seuil optimal (F1 binaire : défaut vs plain).
              </p>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-gray-600 text-xs font-medium">Échantillons / classe</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={perClass}
                      onChange={(e) => setPerClass(Number(e.target.value || 10))}
                      className="bg-white border-gray-300 text-gray-700 w-28"
                    />
                  </div>
                  <Button
                    onClick={handleCalibrate}
                    disabled={isCalibrating || !hasModel || !hasDataset}
                    className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                  >
                    {isCalibrating ? "Calibration..." : "Calibrer automatiquement"}
                  </Button>
                </div>
                {!hasModel && <p className="text-xs text-red-400 mt-2">⚠ Chargez un modèle ONNX d'abord.</p>}
                {hasModel && !hasDataset && <p className="text-xs text-amber-500 mt-2">⚠ Chargez un dataset pour calibrer. Sinon le seuil par défaut (0.6) est utilisé.</p>}
                {calibSummary && (
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white border border-gray-200 p-3 text-xs text-gray-600">{calibSummary}</pre>
                )}
                {!calibSummary && hasCalibration && (
                  <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-700">
                    Dernière calibration : {settings.calibrationReport!.date ? new Date(settings.calibrationReport!.date).toLocaleString() : "—"} — {settings.calibrationReport!.metricsSummary || ""}
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

export default DatasetCalibrateCard;
