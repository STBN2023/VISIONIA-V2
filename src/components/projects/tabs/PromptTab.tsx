import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import RunAnalysisDialog from "@/components/runs/RunAnalysisDialog";
import type { ProjectImage } from "@/utils/storage";
import type { PromptTemplate } from "@/utils/prompts";
import { useMemo, useState } from "react";

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
  tags: string[];
  onRunStarted?: () => void;
};

const PromptTab = ({
  projectId,
  images,
  prompt,
  setPrompt,
  templates,
  projectTemplateId,
  setProjectTemplateId,
  lineErrors: _unusedLineErrors,
  onApplyTemplateToPrompt,
  onSaveProjectTemplateSelection,
  tags,
  onRunStarted,
}: Props) => {
  const [analysisTag, setAnalysisTag] = useState<string>("all");

  const uniqueTags = useMemo(() => {
    // Collect all tags from images and project tags
    const allTags = new Set(tags);
    const counts: Record<string, number> = {};
    
    // Init counts for project tags
    tags.forEach(t => counts[t] = 0);

    images.forEach(img => {
      if (img.tag) {
        allTags.add(img.tag);
        counts[img.tag] = (counts[img.tag] || 0) + 1;
      }
    });

    // Filter out internal/system tags like "pending"
    const filtered = Array.from(allTags).filter(t => 
      t && 
      t !== "pending" && 
      t !== "completed" && 
      t !== "failed" &&
      t.trim().length > 0
    );
    
    return filtered.sort().map(t => ({
      value: t,
      label: `${t} (${counts[t] || 0})`
    }));
  }, [tags, images]);

  const imagesForRun = useMemo(() => {
    if (analysisTag === "all") return images;
    return images.filter((i) => i.tag === analysisTag);
  }, [images, analysisTag]);

  return (
    <div className="mt-4">
      <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardHeader>
          <CardTitle>Prompt maître (projet)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 2 colonnes alignées en haut */}
          <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
            <div className="grid gap-2">
              <Label>Template (projet)</Label>
              <Select value={projectTemplateId ?? "none"} onValueChange={(v) => setProjectTemplateId(v === "none" ? undefined : v)}>
                <SelectTrigger className="h-10 w-full bg-white/10 text-white">
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
                <Button
                  variant="ghost"
                  onClick={onSaveProjectTemplateSelection}
                  className="border border-white/30 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm"
                >
                  Enregistrer le template
                </Button>
                <Button variant="secondary" onClick={onApplyTemplateToPrompt} className="backdrop-blur-sm">
                  Appliquer au prompt
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Filtrer les images analysées</Label>
              <Select value={analysisTag} onValueChange={(v) => setAnalysisTag(v)}>
                <SelectTrigger className="h-10 w-full bg-white/10 text-white">
                  <SelectValue placeholder="Toutes les images" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les images ({images.length})</SelectItem>
                  {uniqueTags.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-white/70">
                {analysisTag === "all"
                  ? `${images.length} image(s) seront analysées.`
                  : `${imagesForRun.length} image(s) avec le tag “${analysisTag}” seront analysées.`}
              </p>
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
            className="bg-white/10 text-white placeholder:text-white/60"
          />
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-white/70">Astuce: vérifiez que le prompt correspond bien aux images.</div>
          <RunAnalysisDialog
            projectId={projectId}
            prompt={prompt}
            images={imagesForRun}
            onStarted={() => onRunStarted?.()}
            disabled={prompt.trim().length === 0 || imagesForRun.length === 0}
            triggerLabel="Générer le compte rendu"
          />
        </CardFooter>
      </Card>
    </div>
  );
};

export default PromptTab;