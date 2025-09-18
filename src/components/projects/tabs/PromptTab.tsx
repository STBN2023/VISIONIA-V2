import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import RunAnalysisDialog from "@/components/runs/RunAnalysisDialog";
import type { ProjectImage } from "@/utils/storage";
import type { PromptTemplate } from "@/utils/prompts";

type Props = {
  projectId: string;
  images: ProjectImage[];
  prompt: string;
  setPrompt: (v: string) => void;
  templates: PromptTemplate[];
  projectTemplateId?: string;
  setProjectTemplateId: (v: string | undefined) => void;
  lineErrors: number[];
  onApplyTemplateToPrompt: () => void;
  onSaveProjectTemplateSelection: () => void;
};

const PromptTab = ({
  projectId,
  images,
  prompt,
  setPrompt,
  templates,
  projectTemplateId,
  setProjectTemplateId,
  lineErrors,
  onApplyTemplateToPrompt,
  onSaveProjectTemplateSelection,
}: Props) => {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Prompt maître (projet)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Template (projet)</Label>
              <Select value={projectTemplateId ?? "none"} onValueChange={(v) => setProjectTemplateId(v === "none" ? undefined : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun (libre)</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onSaveProjectTemplateSelection}>
                  Enregistrer le template
                </Button>
                <Button variant="secondary" onClick={onApplyTemplateToPrompt}>
                  Appliquer au prompt
                </Button>
              </div>
            </div>
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Exemple de structure:
Constat technique:
- ...
Solutions correctives:
- ...
Conformité réglementaire:
- ...`}
            rows={12}
          />
          {lineErrors.length > 0 ? (
            <p className="text-sm text-destructive">Lignes trop longues (&gt; 100 caractères) : {lineErrors.join(", ")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Règle: chaque ligne ≤ 100 caractères.</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">Astuce: vérifiez que le prompt correspond bien aux images.</div>
          <RunAnalysisDialog
            projectId={projectId}
            prompt={prompt}
            images={images}
            onStarted={() => {}}
            disabled={prompt.trim().length === 0 || images.length === 0}
            triggerLabel="Générer le compte rendu"
          />
        </CardFooter>
      </Card>
    </div>
  );
};

export default PromptTab;