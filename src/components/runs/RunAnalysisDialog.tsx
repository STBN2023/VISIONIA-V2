import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

    // 1) Crée un run en 'running'
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

    // 2) Appelle l'API serveur (Vercel -> OpenAI)
    const result = await analyzeLLM({
      mode,
      prompt,
      images,
      model: s.model,
      temperature: s.temperature,
      max_tokens: s.maxTokens,
    });

    // 3) Met à jour le run selon la réponse
    if (result.ok) {
      if (result.mode === "aggregate") {
        completeRunWithServer(run.id, { mode: "aggregate", outputText: result.outputText });
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lancer l’analyse</DialogTitle>
          <DialogDescription>Choisissez le mode d’exécution et validez.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Mode</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as RunMode)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="aggregate" value="aggregate" />
                <Label htmlFor="aggregate">Agrégé (un rapport global)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="per_image" value="per_image" />
                <Label htmlFor="per_image">Par image (un rapport par image)</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>
              L’analyse utilise votre clé OpenAI côté serveur (Vercel). Assurez-vous d’avoir configuré OPENAI_API_KEY dans les variables d’environnement du projet.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={onStart} disabled={!canStart}>Démarrer</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RunAnalysisDialog;