import { useMemo } from "react";
import Dropzone from "@/components/uploader/Dropzone";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Image as ImageIcon, Upload, Trash2, ArrowLeftCircle, ArrowRightCircle } from "lucide-react";
import type { ImageTag, Project, ProjectImage } from "@/utils/storage";
import type { PromptTemplate } from "@/utils/prompts";

const TAGS: { value: ImageTag; label: string }[] = [
  { value: "façade-N", label: "Façade Nord" },
  { value: "façade-S", label: "Façade Sud" },
  { value: "façade-E", label: "Façade Est" },
  { value: "façade-O", label: "Façade Ouest" },
  { value: "toiture", label: "Toiture" },
  { value: "menuiseries", label: "Menuiseries" },
  { value: "réseaux", label: "Réseaux" },
  { value: "pathologies", label: "Pathologies" },
  { value: "autre", label: "Autre" },
];

type Props = {
  project: Project;
  templates: PromptTemplate[];
  tagFilter: "all" | ImageTag;
  setTagFilter: (v: "all" | ImageTag) => void;
  onAddFiles: (files: FileList | File[] | null) => void;
  onDeleteImage: (imgId: string) => void;
  onUpdateTag: (imgId: string, tag?: ImageTag) => void;
  onUpdateImageTemplate: (imgId: string, templateId?: string) => void;
  onMoveImage: (imgId: string, direction: "left" | "right") => void;
};

const ImagesTab = ({
  project,
  templates,
  tagFilter,
  setTagFilter,
  onAddFiles,
  onDeleteImage,
  onUpdateTag,
  onUpdateImageTemplate,
  onMoveImage,
}: Props) => {
  const filteredImages = useMemo(() => {
    return project.images.filter((img) => (tagFilter === "all" ? true : img.tag === tagFilter));
  }, [project.images, tagFilter]);

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ajouter des images</CardTitle>
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
            />
            <Button type="button" variant="outline" onClick={() => document.getElementById("file-input-hidden")?.click()}>
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
          <p className="text-xs text-muted-foreground">Formats: JPG/PNG/WebP • max 25 Mo/image</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {filteredImages.length} image{filteredImages.length > 1 ? "s" : ""} affichée{filteredImages.length > 1 ? "s" : ""}
          {tagFilter !== "all" ? ` (filtre: ${TAGS.find((t) => t.value === tagFilter)?.label})` : ""}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Filtrer par tag</Label>
          <Select value={tagFilter} onValueChange={(v) => setTagFilter((v as ImageTag) || "all")}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Tous les tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {TAGS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {project.images.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">Aucune image pour le moment.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredImages.map((img) => {
            const idx = project.images.findIndex((i) => i.id === img.id);
            const canLeft = idx > 0;
            const canRight = idx < project.images.length - 1;
            return (
              <Card key={img.id} className="overflow-hidden">
                <div className="relative aspect-video w-full bg-muted">
                  <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" draggable={false} />
                </div>
                <CardContent className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{img.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {(img.size / 1024).toFixed(0)} Ko • {new Date(img.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" disabled={!canLeft} onClick={() => onMoveImage(img.id, "left")} title="Déplacer à gauche">
                        <ArrowLeftCircle className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={!canRight} onClick={() => onMoveImage(img.id, "right")} title="Déplacer à droite">
                        <ArrowRightCircle className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onDeleteImage(img.id)} title="Supprimer">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs">Tag</Label>
                    <Select value={img.tag ?? ""} onValueChange={(v) => onUpdateTag(img.id, v as ImageTag)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un tag" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAGS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs">Template (image)</Label>
                    <Select
                      value={img.templateId ?? "inherit"}
                      onValueChange={(v) => onUpdateImageTemplate(img.id, v === "inherit" ? undefined : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Hérite du template projet" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">Hériter du projet</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
                <CardFooter />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ImagesTab;