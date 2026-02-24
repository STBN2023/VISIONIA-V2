import { useMemo, useState, useEffect } from "react";
import Dropzone from "@/components/uploader/Dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, Upload, X, Sparkles, RefreshCcw } from "lucide-react";
import type { ImageTag, Project, ProjectImage } from "@/utils/storage";
import type { PromptTemplate } from "@/utils/prompts";
import ImageCard from "@/components/uploader/ImageCard";
import { showSuccess, showError } from "@/utils/toast";
import { classifyImageToTag, isModelConfigured } from "@/utils/classifier";
import { warmupSession } from "@/utils/inference";
import { toast } from "sonner";
import { applyCorrectionPreference, recordCorrection } from "@/utils/corrections";
import { classifyDataUrl } from "@/utils/inference";
import { updateProject } from "@/utils/storage";
import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase";

// Helpers de normalisation (évite espaces en trop et casse différente)
const normalizeTagLabel = (s: string) => s.trim().replace(/\s+/g, " ");
const normalizeTagKey = (s: string) => normalizeTagLabel(s).toLowerCase();

type Props = {
  project: Project;
  templates: PromptTemplate[];
  tagFilter: "all" | ImageTag;
  setTagFilter: (v: "all" | ImageTag) => void;
  onAddFiles: (files: FileList | File[] | null) => void;
  onDeleteImage: (imgId: string) => void;
  onUpdateTag: (imgId: string, tag?: ImageTag) => Promise<void>;
  onBulkUpdateTags: (ids: string[], tag?: ImageTag) => Promise<void>;
  onUpdateImageTemplate: (imgId: string, templateId?: string) => void;
  onMoveImage: (imgId: string, direction: "left" | "right") => void;
  onCreateTag: (label: string) => Promise<void>;
  onDeleteTag: (label: string) => Promise<void>;
  onApplyTagsPatch: (patch: Record<string, ImageTag | undefined>) => Promise<void>;
  // nouvelle prop optionnelle pour un apply atomique
  onApplyTagsBatch?: (input: { createTags: string[]; patch: Record<string, ImageTag | undefined> }) => Promise<void>;
};

const ImagesTab = ({
  project,
  templates,
  tagFilter,
  setTagFilter,
  onAddFiles,
  onDeleteImage,
  onUpdateTag,
  onBulkUpdateTags,
  onUpdateImageTemplate,
  onMoveImage,
  onCreateTag,
  onDeleteTag,
  onApplyTagsPatch,
  onApplyTagsBatch,
}: Props) => {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isClassifying, setIsClassifying] = useState(false);
  
  // Local state for classification results to provide immediate feedback
  const [localClassifications, setLocalClassifications] = useState<Record<string, { label: string, score: number }>>({});

  const filteredImages = useMemo(() => {
    if (tagFilter === "all") return project.images;
    return project.images.filter((img) => img.tag === tagFilter);
  }, [project.images, tagFilter]);

  const [newTag, setNewTag] = useState("");
  const [classifying, setClassifying] = useState(false);

  // Choix du tag à appliquer en masse
  const [bulkExistingTag, setBulkExistingTag] = useState<"none" | string>("none");
  const [bulkNewTag, setBulkNewTag] = useState("");

  // Scores/labels de classification en mémoire (non persistés)
  const [classifMap, setClassifMap] = useState<Record<string, { score: number; label: string }>>({});

  // Wrapper: enregistre une correction quand l'utilisateur modifie un tag après une suggestion
  const handleUpdateTagWithLearning = async (imgId: string, tag?: ImageTag) => {
    const prevSuggested = classifMap[imgId]?.label; // tag suggéré affiché
    await onUpdateTag(imgId, tag);
    if (prevSuggested && tag && prevSuggested !== tag) {
      recordCorrection(prevSuggested, tag);
    }
  };

  const addTag = async () => {
    const label = normalizeTagLabel(newTag);
    if (!label) return;
    const existing = new Set(project.tags.map(normalizeTagKey));
    if (!existing.has(normalizeTagKey(label))) {
      await onCreateTag(label);
    }
    setNewTag("");
  };

  const toggleSelection = (imgId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(imgId)) {
      newSelected.delete(imgId);
    } else {
      newSelected.add(imgId);
    }
    setSelectedIds(newSelected);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const applyBulkTag = async () => {
    if (selectedIds.size === 0) return;
    let toApply: string | undefined = undefined;

    const newLabel = normalizeTagLabel(bulkNewTag);
    if (newLabel) {
      const existing = new Set(project.tags.map(normalizeTagKey));
      if (!existing.has(normalizeTagKey(newLabel))) {
        await onCreateTag(newLabel);
      }
      toApply = newLabel;
    } else if (bulkExistingTag !== "none") {
      toApply = bulkExistingTag;
    } else {
      toApply = undefined; // retirer le tag
    }

    if (typeof onBulkUpdateTags === "function") {
      await onBulkUpdateTags(Array.from(selectedIds), toApply);
    } else {
      for (const id of selectedIds) {
        await onUpdateTag(id, toApply);
      }
    }

    // Apprentissage: si on applique un tag et qu'une suggestion précédente existait et diffère, on l'enregistre
    if (toApply) {
      for (const id of selectedIds) {
        const prevSuggested = classifMap[id]?.label;
        if (prevSuggested && prevSuggested !== toApply) {
          recordCorrection(prevSuggested, toApply);
        }
      }
    }

    showSuccess(
      toApply ? `Tag “${toApply}” appliqué à ${selectedIds.size} image(s)` : `Tag retiré sur ${selectedIds.size} image(s)`,
    );

    // Reset
    setBulkExistingTag("none");
    setBulkNewTag("");
    clearSelection();
    setSelectMode(false);
  };

  const handleClassifyAll = async () => {
    setIsClassifying(true);
    const updatedImages = [...project.images];

    for (let i = 0; i < updatedImages.length; i++) {
      const img = updatedImages[i];
      try {
        const result = await classifyDataUrl(img.dataUrl);
        const classification = { label: result.topLabel, score: result.topScore };
        updatedImages[i] = { ...img, inferenceResult: classification };
      } catch (e) {
        console.error("Classification error for", img.name, e);
      }
    }
    
    setLocalClassifications({}); // Clear temporary state
    await updateProject(project.id, { images: updatedImages });
    setIsClassifying(false);
  };

  const handleResetClassifications = async () => {
    if (!confirm("Réinitialiser toutes les classifications de ce projet ?")) return;
    
    setIsClassifying(true);
    setLocalClassifications({});
    
    // 1. Mise à jour locale pour retour immédiat
    const resetImages = project.images.map(img => ({
      ...img,
      inferenceResult: undefined
    }));

    // 2. Mise à jour forcée dans la base de données
    // On doit s'assurer que detection_results est vidé pour chaque inspection
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      for (const img of project.images) {
        await supabase
          .from('inspections')
          .update({
            detection_results: null // Efface physiquement les résultats ONNX et LLM
          })
          .eq('id', img.id);
      }
    }

    // 3. Rafraîchir l'état du projet via le storage helper
    await updateProject(project.id, { images: resetImages });
    
    setIsClassifying(false);
    showSuccess("Classifications réinitialisées");
  };

  return (
    <div className="mt-4 space-y-4">
      <Card className="rounded-3xl border-white/20 bg-white/10 backdrop-blur-2xl">
        <CardHeader>
          <CardTitle className="text-white">Ajouter des images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Dropzone
            accept="image/jpeg,image/png,image/webp"
            multiple
            onFiles={onAddFiles}
            label="Glissez-déposez vos images ici"
            hint="ou cliquez pour sélectionner (JPG/PNG/WebP, 25 Mo max)"
            className="w-full"
          />
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => onAddFiles(e.target.files)}
              className="bg-white/10 text-white file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-2 file:text-white"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById("file-input-hidden")?.click()}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
            >
              <Upload className="mr-2 h-4 w-4" />
              Parcourir
            </Button>
          </div>
          <input
            id="file-input-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => onAddFiles(e.target.files)}
          />
          <p className="text-xs text-white/70">Formats: JPG/PNG/WebP • max 25 Mo/image</p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardHeader>
          <CardTitle>Tags du projet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {project.tags.length === 0 ? (
              <p className="text-sm text-white/80">Aucun tag pour le moment.</p>
            ) : (
              project.tags.map((t) => (
                <Badge key={t} variant="secondary" className="flex items-center gap-1">
                  {t}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 hover:bg-white/10"
                    title="Supprimer le tag"
                    onClick={() => onDeleteTag(t)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Nouveau tag (ex: façade N, toiture...)"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="bg-white/10 text-white placeholder:text-white/60"
            />
            <Button type="button" onClick={addTag} className="backdrop-blur-sm">Ajouter</Button>
          </div>
        </CardContent>
      </Card>

      {/* Ligne d'outils: compteur + filtre + bascule mode sélection */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-white/80">
          {filteredImages.length} image{filteredImages.length > 1 ? "s" : ""} affichée{filteredImages.length > 1 ? "s" : ""}
          {tagFilter !== "all" ? ` (filtre: ${tagFilter})` : ""}
          {selectMode && selectedIds.size > 0 ? ` • ${selectedIds.size} sélectionnée(s)` : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleClassifyAll}
            disabled={isClassifying || project.images.length === 0}
            className="bg-slate-900/80 text-white border border-white/20 hover:bg-slate-800"
          >
            <RefreshCcw className={cn("mr-2 h-4 w-4", { "animate-spin": isClassifying })} />
            {isClassifying ? "Analyse..." : "Classer et taguer"}
          </Button>

          {project.images.some(img => img.inferenceResult) && (
            <Button
              variant="ghost"
              onClick={handleResetClassifications}
              disabled={isClassifying}
              className="text-white/60 hover:text-white hover:bg-white/10"
            >
              Réinitialiser
            </Button>
          )}

          <div className="h-8 w-px bg-white/10 mx-2 hidden sm:block" />
          <Button
            type="button"
            variant={selectMode ? "secondary" : "outline"}
            onClick={() => {
              setSelectMode((v) => {
                const next = !v;
                if (!next) setSelectedIds(new Set());
                return next;
              });
            }}
            className={selectMode ? "backdrop-blur-sm" : "bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"}
          >
            {selectMode ? "Quitter sélection" : "Mode sélection"}
          </Button>
          <Label className="text-xs text-white/80">Filtrer par tag</Label>
          <Select value={tagFilter} onValueChange={(v) => setTagFilter((v as ImageTag) || "all")}>
            <SelectTrigger className="w-[240px] bg-white/10 text-white">
              <SelectValue placeholder="Tous les tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {project.tags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Barre d'actions en masse */}
      {selectMode ? (
        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const newSelected = new Set(selectedIds);
                  if (newSelected.size === filteredImages.length) {
                    newSelected.clear();
                  } else {
                    filteredImages.forEach(img => newSelected.add(img.id));
                  }
                  setSelectedIds(newSelected);
                }}
                className="border-white/30 bg-transparent text-white hover:bg-white/10"
              >
                {selectedIds.size === filteredImages.length ? "Tout désélectionner" : "Tout sélectionner"}
              </Button>
              <Button
                variant="ghost"
                onClick={clearSelection}
                className="bg-white/10 text-white hover:bg-white/20"
              >
                Effacer la sélection
              </Button>
              <div className="mx-2 h-6 w-px bg-white/20" aria-hidden />
              <div className="flex items-center gap-2">
                <Label className="text-xs">Tag existant</Label>
                <Select
                  value={bulkExistingTag}
                  onValueChange={(v) => setBulkExistingTag(v as "none" | string)}
                >
                  <SelectTrigger className="w-[220px] bg-white/10 text-white">
                    <SelectValue placeholder="Choisir un tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun (retirer)</SelectItem>
                    {project.tags.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Nouveau tag</Label>
                <Input
                  value={bulkNewTag}
                  onChange={(e) => setBulkNewTag(e.target.value)}
                  placeholder="Saisir un nouveau tag"
                  className="w-[220px] bg-white/10 text-white placeholder:text-white/60"
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    const t = normalizeTagLabel(bulkNewTag);
                    if (!t) return;
                    const existing = new Set(project.tags.map(normalizeTagKey));
                    if (!existing.has(normalizeTagKey(t))) {
                      await onCreateTag(t);
                    }
                  }}
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  Ajouter au projet
                </Button>
              </div>
              <div className="mx-2 h-6 w-px bg-white/20" aria-hidden />
              <Button
                onClick={applyBulkTag}
                disabled={selectedIds.size === 0}
                className="backdrop-blur-sm"
                title={selectedIds.size === 0 ? "Sélectionnez des images" : "Appliquer le tag aux images sélectionnées"}
              >
                Appliquer
              </Button>
            </div>
            <p className="text-xs text-white/70">
              Astuce: si "Nouveau tag" est saisi, il sera créé puis appliqué. Sinon, le tag existant choisi sera appliqué. "Aucun" retire le tag.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {project.images.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/20 bg-white/5 py-16 text-center backdrop-blur-xl">
          <ImageIcon className="mb-3 h-8 w-8 text-white/70" />
          <p className="text-white/80">Aucune image pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredImages.map((img, idx) => (
            <ImageCard
              key={img.id}
              img={img}
              canLeft={idx > 0}
              canRight={idx < filteredImages.length - 1}
              templates={templates}
              availableTags={project.tags || []}
              onMoveImage={onMoveImage}
              onDeleteImage={onDeleteImage}
              onUpdateTag={onUpdateTag}
              onUpdateImageTemplate={onUpdateImageTemplate}
              onCreateTag={onCreateTag}
              selectMode={selectMode}
              selected={selectedIds.has(img.id)}
              onSelectChange={toggleSelection}
              classificationLabel={localClassifications[img.id]?.label || img.inferenceResult?.label}
              classificationScore={localClassifications[img.id]?.score || img.inferenceResult?.score}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ImagesTab;