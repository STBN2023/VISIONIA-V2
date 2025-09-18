import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ProjectImage } from "@/utils/storage";
import { createRun, type RunMode } from "@/utils/runs";
import { showError, showSuccess } from "@/utils/toast";
import { getSettings } from "@/utils/settings";

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

  const onStart = () => {
    if (!canStart) {
      showError("Ajoutez un prompt et au moins une image.");
      return;
    }
    const s = getSettings();
    const run = createRun({
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
              Cette démonstration simule l’analyse et génère un rendu à partir du prompt saisi. Pour une intégration LLM réelle, ajoutez un backend (ex: Supabase).
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