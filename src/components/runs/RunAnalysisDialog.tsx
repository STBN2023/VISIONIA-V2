import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import GlassDialogContent from "@/components/glass/GlassDialogContent";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ProjectImage } from "@/utils/storage";
import { createPendingRun, completeRunWithServer, failRun, type RunMode } from "@/utils/runs";
import { showError, showSuccess } from "@/utils/toast";
import { getSettings } from "@/utils/settings";
import { analyzeLLM } from "@/utils/analyze-client";

type Props = {
  projectId: string;
  prompt: string;
  images: ProjectImage[];
  disabled?: boolean;
  onStarted?: (runId: string) => void;
  triggerLabel?: string;
};

const RunAnalysisDialog = ({ projectId, prompt, images, disabled, onStarted, triggerLabel = "Lancer l'analyse" }: Props) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RunMode>("aggregate");

  const canStart = !disabled && prompt.trim().length > 0 && images.length > 0;

  const onStart = async () => {
    if (!canStart) {
      showError("Ajoutez un prompt et au moins une image.");
      return;
    }
    const s = getSettings();
    if (!s.apiKey || s.apiKey.trim().length < 10) {
      showError("Aucune clé API détectée. Renseignez votre clé dans Paramètres.");
      return;
    }

    const run = createPendingRun({
      projectId,
      mode,
      prompt,
      images,
      model: s.model,
      temperature: s.temperature,
    });

    setOpen(false);
    showSuccess("Analyse démarrée");
    onStarted?.(run.id);

    const result = await analyzeLLM({
      mode,
      prompt,
      images,
      model: s.model,
      temperature: s.temperature,
      max_tokens: s.maxTokens,
    });

    if (result.ok) {
      if (result.mode === "aggregate") {
        completeRunWithServer(run.id, { mode: "aggregate", outputText: result.outputText, items: result.items });
      } else {
        completeRunWithServer(run.id, { mode: "per_image", items: result.items });
      }
      showSuccess("Analyse terminée");
    } else {
      failRun(run.id, result.error);
      showError(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>{triggerLabel}</Button>
      </DialogTrigger>
      <GlassDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lancer l’analyse</DialogTitle>
          <DialogDescription>Choisissez le mode d’exécution et validez.</DialogDescription>
        </DialogHeader>
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

          <div className="rounded-md border border-white/20 bg-white/10 p-3 text-sm text-white/80">
            <p>
              L’analyse utilise votre clé OpenAI stockée localement (Paramètres).
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} className="backdrop-blur-sm">
              Annuler
            </Button>
            <Button onClick={onStart} disabled={!canStart} className="backdrop-blur-sm">Démarrer</Button>
          </div>
        </div>
      </GlassDialogContent>
    </Dialog>
  );
};

export default RunAnalysisDialog;