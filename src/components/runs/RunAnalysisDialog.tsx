import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import GlassDialogContent from "@/components/glass/GlassDialogContent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import type { ProjectImage } from "@/utils/storage";
import { createPendingRun, completeRunWithServer, failRun, type RunMode } from "@/utils/runs";
import { showError, showSuccess } from "@/utils/toast";
import { useSettings } from "@/contexts/SettingsContext";
import { classifyDataUrl } from "@/utils/inference";
import { isSuspectFrom } from "@/utils/classifier";
import { analyzeLLM, type AnalyzeErr } from "@/utils/analyze-client";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, Circle, Clock } from "lucide-react";

type Props = {
  projectId: string;
  prompt: string;
  images: ProjectImage[];
  disabled?: boolean;
  onStarted?: (runId: string) => void;
  triggerLabel?: string;
};

type StepStatus = "pending" | "running" | "done";
type Step = { label: string; status: StepStatus; detail?: string };

const StepIndicator = ({ step }: { step: Step }) => {
  const icon =
    step.status === "done" ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> :
    step.status === "running" ? <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" /> :
    <Circle className="h-4 w-4 text-white/20 shrink-0" />;

  return (
    <div className={`flex items-start gap-2.5 py-1.5 ${step.status === "pending" ? "opacity-40" : ""}`}>
      {icon}
      <div className="min-w-0">
        <span className={`text-sm ${step.status === "running" ? "text-white font-medium" : step.status === "done" ? "text-white/70" : "text-white/40"}`}>
          {step.label}
        </span>
        {step.detail && (
          <p className="text-xs text-white/50 mt-0.5 truncate">{step.detail}</p>
        )}
      </div>
    </div>
  );
};

const RunAnalysisDialog = ({ projectId, prompt, images, disabled, onStarted, triggerLabel = "Lancer l'analyse" }: Props) => {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RunMode>("aggregate");
  const [onlySuspects, setOnlySuspects] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressPhase, setProgressPhase] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const canStart = !disabled && !isRunning && prompt.trim().length > 0 && images.length > 0;

  const updateStep = (index: number, patch: Partial<Step>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };

  const onStart = async () => {
    try {
      if (!canStart) {
        showError("Ajoutez un prompt et au moins une image.");
        return;
      }

      setIsRunning(true);
      setProgressCurrent(0);
      setProgressTotal(0);
      setProgressPhase("Préparation...");
      setElapsedSeconds(0);

      // Timer
      const startTime = Date.now();
      const timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      // Build steps
      const initialSteps: Step[] = [];
      if (onlySuspects) {
        initialSteps.push({ label: "Pré-filtrage ONNX", status: "pending" });
      }
      initialSteps.push({ label: "Préparation du run", status: "running" });
      if (mode === "aggregate") {
        initialSteps.push({ label: "Rapport global (toutes images)", status: "pending" });
        initialSteps.push({ label: `Analyse détaillée (${images.length} images)`, status: "pending" });
      } else {
        initialSteps.push({ label: `Analyse par image (${images.length} images)`, status: "pending" });
      }
      initialSteps.push({ label: "Sauvegarde des résultats", status: "pending" });
      setSteps(initialSteps);

      let stepIdx = onlySuspects ? 1 : 0; // index of "Préparation"

      let imgs = images;
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      // ONNX pre-filter
      if (onlySuspects) {
        updateStep(0, { status: "running" });
        if (!settings.modelRef) {
          showError("Aucun modèle ONNX configuré (Paramètres > Dataset & Calibrage).");
          clearInterval(timer);
          setIsRunning(false);
          return;
        }
        const threshold = settings.inference?.threshold ?? 0.6;
        const suspects: typeof images = [];
        for (let i = 0; i < images.length; i++) {
          const im = images[i];
          updateStep(0, { detail: `Image ${i + 1}/${images.length}…` });
          setProgressCurrent(i + 1);
          setProgressTotal(images.length);

          const result = await classifyDataUrl(im.dataUrl);
          const { topLabel, topScore } = result;

          if (user) {
            await supabase
              .from('inspections')
              .update({
                detection_results: {
                  onnx: { label: topLabel, score: topScore, probs: result.probs, timestamp: new Date().toISOString() }
                }
              })
              .eq('id', im.id);
          }

          // Le softmax répartit la masse entre classes concurrentes : filtrer sur
          // le top-1 écarte les photos cumulant plusieurs désordres, qui sont
          // précisément celles qui méritent l'analyse. On juge donc sur P(défaut).
          if (isSuspectFrom(result.probs, threshold)) {
            suspects.push(im);
          }
        }
        updateStep(0, { status: "done", detail: `${suspects.length}/${images.length} suspectes` });

        if (suspects.length === 0) {
          showError("Aucune image suspecte selon le seuil calibré.");
          clearInterval(timer);
          setIsRunning(false);
          return;
        }
        imgs = suspects;
      }

      // Create run
      updateStep(stepIdx, { status: "done" });
      stepIdx++;

      const run = await createPendingRun({
        projectId,
        mode,
        prompt,
        images: imgs,
        model: settings.model,
        temperature: typeof settings.temperature === "number" ? settings.temperature : 0.2,
      });

      showSuccess("Analyse démarrée");
      onStarted?.(run.id);

      // LLM analysis
      if (mode === "aggregate") {
        // Step: rapport global
        updateStep(stepIdx, { status: "running", detail: `${imgs.length} images envoyées…` });
      } else {
        updateStep(stepIdx, { status: "running" });
      }

      const result = await analyzeLLM({
        mode,
        prompt,
        images: imgs,
        model: settings.model,
        temperature: typeof settings.temperature === "number" ? settings.temperature : 0.2,
        max_tokens: typeof settings.maxTokens === "number" ? settings.maxTokens : 2000,
        onProgress: (current, total, phase) => {
          setProgressCurrent(current);
          setProgressTotal(total);
          setProgressPhase(phase);

          if (mode === "aggregate") {
            if (phase.includes("global")) {
              updateStep(stepIdx, { status: "running", detail: "Génération en cours…" });
            } else if (phase.includes("image")) {
              updateStep(stepIdx, { status: "done" });
              updateStep(stepIdx + 1, { status: "running", detail: `${current - 1}/${imgs.length} terminées` });
            }
          } else {
            updateStep(stepIdx, { status: "running", detail: `${current}/${total} terminées` });
          }
        },
      });

      // Mark analysis steps done
      if (mode === "aggregate") {
        updateStep(stepIdx, { status: "done" });
        updateStep(stepIdx + 1, { status: "done", detail: `${imgs.length} images analysées` });
        stepIdx += 2;
      } else {
        updateStep(stepIdx, { status: "done", detail: `${imgs.length} images analysées` });
        stepIdx++;
      }

      if (!result.ok) {
        const err = result as AnalyzeErr;
        await failRun(run.id, err.error);
        showError(err.error);
        clearInterval(timer);
        setIsRunning(false);
        setOpen(false);
        return;
      }

      // Save results
      updateStep(stepIdx, { status: "running", detail: "Enregistrement…" });

      if (result.mode === "aggregate") {
        await completeRunWithServer(run.id, { mode: "aggregate", outputText: result.outputText, items: result.items });

        if (user && result.items) {
          for (const item of result.items) {
            const matchingImg = imgs.find(img => img.id === item.imageId);
            if (matchingImg) {
              const { data: currentIns } = await supabase
                .from('inspections')
                .select('detection_results')
                .eq('id', matchingImg.id)
                .single();

              const currentResults = (currentIns?.detection_results as any) || {};
              const anomalyDetected = (item.boxes && item.boxes.length > 0) || false;

              await supabase
                .from('inspections')
                .update({
                  detection_results: {
                    ...currentResults,
                    llm: { analysis: item.outputText, anomalyDetected, timestamp: new Date().toISOString() }
                  },
                  status: anomalyDetected ? 'defect' : 'clear'
                })
                .eq('id', matchingImg.id);
            }
          }
        }
      } else {
        await completeRunWithServer(run.id, { mode: "per_image", items: result.items });

        if (user && result.items) {
          for (const item of result.items) {
            const matchingImg = imgs.find(img => img.id === item.imageId);
            if (matchingImg) {
              const { data: currentIns } = await supabase
                .from('inspections')
                .select('detection_results')
                .eq('id', matchingImg.id)
                .single();

              const currentResults = (currentIns?.detection_results as any) || {};
              const anomalyDetected = (item.boxes && item.boxes.length > 0) || false;

              await supabase
                .from('inspections')
                .update({
                  detection_results: {
                    ...currentResults,
                    llm: { analysis: item.outputText, anomalyDetected, timestamp: new Date().toISOString() }
                  },
                  status: anomalyDetected ? 'defect' : 'clear'
                })
                .eq('id', matchingImg.id);
            }
          }
        }
      }

      updateStep(stepIdx, { status: "done" });
      clearInterval(timer);
      showSuccess("Analyse terminée");
      setIsRunning(false);
      setOpen(false);
    } catch (e: any) {
      console.error("Erreur lors du démarrage de l'analyse:", e);
      showError(e.message || "Une erreur est survenue lors du démarrage.");
      setIsRunning(false);
    }
  };

  const progressPercent = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <Dialog open={open || isRunning} onOpenChange={(o) => { if (!isRunning) setOpen(o); }}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>{triggerLabel}</Button>
      </DialogTrigger>
      <GlassDialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRunning ? "Analyse en cours…" : "Lancer l'analyse"}</DialogTitle>
          <DialogDescription>
            {isRunning ? "Veuillez patienter pendant le traitement." : "Choisissez le mode d'exécution et validez."}
          </DialogDescription>
        </DialogHeader>

        {isRunning ? (
          <div className="space-y-4 py-2">
            {/* Timer */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white/60 text-xs">
                <Clock className="h-3.5 w-3.5" />
                <span>Temps écoulé : {formatTime(elapsedSeconds)}</span>
              </div>
              <span className="text-xs text-white/40">{progressPhase}</span>
            </div>

            {/* Progress bar */}
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between text-xs text-white/40">
              <span>{progressCurrent}/{progressTotal}</span>
              <span>{progressPercent}%</span>
            </div>

            {/* Steps */}
            <div className="rounded-xl border border-white/15 bg-white/5 p-3 space-y-0.5 max-h-[240px] overflow-y-auto">
              {steps.map((step, i) => (
                <StepIndicator key={i} step={step} />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Mode</Label>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">
                <RadioGroup
                  value={mode}
                  onValueChange={(v) => setMode(v as RunMode)}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem
                      id="aggregate"
                      value="aggregate"
                      className="h-4 w-4 border-white/60 data-[state=checked]:bg-white data-[state=checked]:border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    />
                    <Label htmlFor="aggregate" className="cursor-pointer text-white/90">
                      Agrégé (rapport global + détails par image)
                    </Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <RadioGroupItem
                      id="per_image"
                      value="per_image"
                      className="h-4 w-4 border-white/60 data-[state=checked]:bg-white data-[state=checked]:border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    />
                    <Label htmlFor="per_image" className="cursor-pointer text-white/90">
                      Par image (un rapport par image)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="onlySuspects"
                  checked={onlySuspects}
                  onCheckedChange={(v) => setOnlySuspects(Boolean(v))}
                  className="data-[state=checked]:bg-white data-[state=checked]:text-black"
                />
                <Label htmlFor="onlySuspects" className="cursor-pointer text-white/90">
                  Analyser uniquement les images suspectes (P(défaut) ≥ seuil calibré)
                </Label>
              </div>
              <p className="mt-2 text-xs text-white/70">
                Utilise le modèle ONNX local pour filtrer avant d'appeler le LLM. Le critère est la
                probabilité que la photo ne soit pas saine, et non le score d'une classe précise :
                une photo cumulant plusieurs désordres reste retenue.
              </p>
            </div>

            {/* Résumé avant lancement */}
            <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-white/60 space-y-1">
              <div className="flex justify-between"><span>Images :</span><span className="text-white/80 font-medium">{images.length}</span></div>
              <div className="flex justify-between"><span>Modèle :</span><span className="text-white/80 font-medium">{settings.model || "gpt-4o"}</span></div>
              <div className="flex justify-between"><span>Prompt :</span><span className="text-white/80 font-medium">{prompt.length > 0 ? `${prompt.length} car.` : "—"}</span></div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} className="backdrop-blur-sm">
                Annuler
              </Button>
              <Button onClick={onStart} disabled={!canStart} className="backdrop-blur-sm">Démarrer</Button>
            </div>
          </div>
        )}
      </GlassDialogContent>
    </Dialog>
  );
};

export default RunAnalysisDialog;