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
import { analyzeLLM, type AnalyzeErr } from "@/utils/analyze-client";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Props = {
  projectId: string;
  prompt: string;
  images: ProjectImage[];
  disabled?: boolean;
  onStarted?: (runId: string) => void;
  triggerLabel?: string;
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

  const canStart = !disabled && !isRunning && prompt.trim().length > 0 && images.length > 0;

  const onStart = async () => {
    try {
      if (!canStart) {
        showError("Ajoutez un prompt et au moins une image.");
        return;
      }
      if (!settings.apiKey || settings.apiKey.trim().length < 10) {
        showError("Aucune clé API détectée. Renseignez votre clé dans Paramètres.");
        return;
      }

      setIsRunning(true);
      setProgressCurrent(0);
      setProgressTotal(0);
      setProgressPhase("Préparation...");
      
      // Filtrage optionnel: uniquement les suspectes (selon classifieur ONNX)
      let imgs = images;
      const { data: { user } } = await supabase.auth.getUser();

      if (onlySuspects) {
        if (!settings.modelRef) {
          showError("Aucun modèle ONNX configuré (Paramètres > Dataset & Calibrage).");
          setIsRunning(false);
          return;
        }
        setProgressPhase("Pré-filtrage ONNX...");
        const threshold = settings.inference?.threshold ?? 0.6;
        const suspects: typeof images = [];
        for (let i = 0; i < images.length; i++) {
          const im = images[i];
          setProgressCurrent(i + 1);
          setProgressTotal(images.length);
          setProgressPhase(`Pré-filtrage ONNX ${i + 1}/${images.length}...`);
          
          const result = await classifyDataUrl(im.dataUrl);
          const { topLabel, topScore } = result;

          if (user) {
            await supabase
              .from('inspections')
              .update({
                detection_results: {
                  onnx: {
                    label: topLabel,
                    score: topScore,
                    probs: result.probs,
                    timestamp: new Date().toISOString()
                  }
                }
              })
              .eq('id', im.id);
          }

          if (topLabel !== "plain" && topScore >= threshold) {
            suspects.push(im);
          }
        }
        if (suspects.length === 0) {
          showError("Aucune image suspecte selon le seuil calibré.");
          setIsRunning(false);
          return;
        }
        imgs = suspects;
      }

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
        },
      });

      if (!result.ok) {
        const err = result as AnalyzeErr;
        await failRun(run.id, err.error);
        showError(err.error);
        setIsRunning(false);
        setOpen(false);
        return;
      }

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
                    llm: {
                      analysis: item.outputText,
                      anomalyDetected: anomalyDetected,
                      timestamp: new Date().toISOString()
                    }
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
                    llm: {
                      analysis: item.outputText,
                      anomalyDetected: anomalyDetected,
                      timestamp: new Date().toISOString()
                    }
                  },
                  status: anomalyDetected ? 'defect' : 'clear'
                })
                .eq('id', matchingImg.id);
            }
          }
        }
      }
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

  return (
    <Dialog open={open || isRunning} onOpenChange={(o) => { if (!isRunning) setOpen(o); }}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>{triggerLabel}</Button>
      </DialogTrigger>
      <GlassDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRunning ? "Analyse en cours..." : "Lancer l'analyse"}</DialogTitle>
          <DialogDescription>
            {isRunning ? "Veuillez patienter pendant le traitement." : "Choisissez le mode d'exécution et validez."}
          </DialogDescription>
        </DialogHeader>

        {isRunning ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-white/80" />
              <span className="text-sm text-white/90">{progressPhase}</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
            <div className="flex justify-between text-xs text-white/60">
              <span>{progressCurrent}/{progressTotal}</span>
              <span>{progressPercent}%</span>
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
                    <Label
                      htmlFor="aggregate"
                      className="cursor-pointer text-white/90"
                    >
                      Agrégé (rapport global + détails par image)
                    </Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <RadioGroupItem
                      id="per_image"
                      value="per_image"
                      className="h-4 w-4 border-white/60 data-[state=checked]:bg-white data-[state=checked]:border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    />
                    <Label
                      htmlFor="per_image"
                      className="cursor-pointer text-white/90"
                    >
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
                  Analyser uniquement les images suspectes (score ≥ seuil calibré)
                </Label>
              </div>
              <p className="mt-2 text-xs text-white/70">
                Utilise le modèle ONNX local pour filtrer (plain vs défaut) avant d'appeler le LLM.
              </p>
            </div>

            <div className="rounded-md border border-white/20 bg-white/10 p-3 text-sm text-white/80">
              <p>
                L'analyse utilise votre clé OpenAI stockée localement (Paramètres).
              </p>
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