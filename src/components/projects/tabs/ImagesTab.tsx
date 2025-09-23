import { useMemo, useState } from "react";
import Dropzone from "@/components/uploader/Dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import type { ImageTag, Project } from "@/utils/storage";
import type { PromptTemplate } from "@/utils/prompts";
import ImageCard from "@/components/uploader/ImageCard";
import { showSuccess } from "@/utils/toast";

type Props = {
  project: Project;
  templates: PromptTemplate[];
  tagFilter: "all" | ImageTag;
  setTagFilter: (v: "all" | ImageTag) => void;
  onAddFiles: (files: FileList | File[] | null) => void;
  onDeleteImage: (imgId: string) => void;
  onUpdateTag: (imgId: string, tag?: ImageTag) => void;
  onBulkUpdateTags: (ids: string[], tag?: ImageTag) => void;
  onUpdateImageTemplate: (imgId: string, templateId?: string) => void;
  onMoveImage: (imgId: string, direction: "left" | "right") => void;
  onCreateTag: (label: string) => void;
  onDeleteTag: (label: string) => void;
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
}: Props) => {
  const filteredImages = useMemo(() => {
    return project.images.filter((img) => (tagFilter === "all" ? true : img.tag === tagFilter));
  }, [project.images, tagFilter]);

  const [newTag, setNewTag] = useState("");

  // Mode sélection pour tagging en masse
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );
  const selectedCount = selectedIds.length;

  // Choix du tag à appliquer en masse
  const [bulkExistingTag, setBulkExistingTag] = useState<"none" | string>("none");
  const [bulkNewTag, setBulkNewTag] = useState("");

  const addTag = () => {
    const label = newTag.trim();
    if (!label) return;
    if (!project.tags.includes(label)) {
      onCreateTag(label);
    }
    setNewTag("");
  };

  const toggleSelectAll = () => {
    if (selectedCount === filteredImages.length) {
      setSelected({});
    } else {
      const map: Record<string, boolean> = {};
      filteredImages.forEach((img) => (map[img.id] = true));
      setSelected(map);
    }
  };

  const clearSelection = () => setSelected({});

  const applyBulkTag = () => {
    if (selectedCount === 0) return;
    let toApply: string | undefined = undefined;

    const newLabel = bulkNewTag.trim();
    if (newLabel) {
      if (!project.tags.includes(newLabel)) {
        onCreateTag(newLabel);
      }
      toApply = newLabel;
    } else if (bulkExistingTag !== "none") {
      toApply = bulkExistingTag;
    } else {
      toApply = undefined; // retirer le tag
    }

    // Applique à toutes les images sélectionnées en un seul patch
    onBulkUpdateTags(selectedIds, toApply);
    showSuccess(
      toApply ? `Tag “${toApply}” appliqué à ${selectedCount} image(s)` : `Tag retiré sur ${selectedCount} image(s)`,
    );

    // Reset
    setBulkExistingTag("none");
    setBulkNewTag("");
    clearSelection();
    setSelectMode(false);
  };

  return (
    <div className="mt-4 text-white space-y-4">
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

      {/* Ligne d’outils: compteur + filtre + bascule mode sélection */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-white/80">
          {filteredImages.length} image{filteredImages.length > 1 ? "s" : ""} affichée{filteredImages.length > 1 ? "s" : ""}
          {tagFilter !== "all" ? ` (filtre: ${tagFilter})` : ""}
          {selectMode && selectedCount > 0 ? ` • ${selectedCount} sélectionnée(s)` : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={selectMode ? "secondary" : "outline"}
            onClick={() => {
              setSelectMode((v) => {
                const next = !v;
                if (!next) setSelected({});
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

      {/* Barre d’actions en masse, visible en mode sélection */}
      {selectMode ? (
        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={toggleSelectAll}
                className="border-white/30 bg-transparent text-white hover:bg-white/10"
              >
                {selectedCount === filteredImages.length ? "Tout désélectionner" : "Tout sélectionner"}
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
                  onClick={() => {
                    const t = bulkNewTag.trim();
                    if (!t) return;
                    if (!project.tags.includes(t)) {
                      onCreateTag(t);
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
                disabled={selectedCount === 0}
                className="backdrop-blur-sm"
                title={selectedCount === 0 ? "Sélectionnez des images" : "Appliquer le tag aux images sélectionnées"}
              >
                Appliquer
              </Button>
            </div>
            <p className="text-xs text-white/70">
              Astuce: si “Nouveau tag” est saisi, il sera créé puis appliqué. Sinon, le tag existant choisi sera appliqué. “Aucun” retire le tag.
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
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredImages.map((img) => {
            const idx = project.images.findIndex((i) => i.id === img.id);
            const canLeft = idx > 0;
            const canRight = idx < project.images.length - 1;
            const isSelected = !!selected[img.id];

            return (
              <ImageCard
                key={img.id}
                img={img}
                canLeft={canLeft}
                canRight={canRight}
                templates={templates}
                availableTags={project.tags}
                onMoveImage={onMoveImage}
                onDeleteImage={onDeleteImage}
                onUpdateTag={onUpdateTag}
                onUpdateImageTemplate={onUpdateImageTemplate}
                onCreateTag={onCreateTag}
                // Sélection multiple
                selectMode={selectMode}
                selected={isSelected}
                onSelectChange={(id, s) =>
                  setSelected((prev) => ({ ...prev, [id]: s }))
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ImagesTab;