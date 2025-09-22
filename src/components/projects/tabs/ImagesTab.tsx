import { useMemo } from "react";
import Dropzone from "@/components/uploader/Dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Image as ImageIcon, Upload } from "lucide-react";
import type { ImageTag, Project } from "@/utils/storage";
import type { PromptTemplate } from "@/utils/prompts";
import ImageCard from "@/components/uploader/ImageCard";

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
          {tagFilter !== "all" ? ` (filtre actif)` : ""}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Filtrer par tag</Label>
          <Select value={tagFilter} onValueChange={(v) => setTagFilter((v as ImageTag) || "all")}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Tous les tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="façade-N">Façade Nord</SelectItem>
              <SelectItem value="façade-S">Façade Sud</SelectItem>
              <SelectItem value="façade-E">Façade Est</SelectItem>
              <SelectItem value="façade-O">Façade Ouest</SelectItem>
              <SelectItem value="toiture">Toiture</SelectItem>
              <SelectItem value="menuiseries">Menuiseries</SelectItem>
              <SelectItem value="réseaux">Réseaux</SelectItem>
              <SelectItem value="pathologies">Pathologies</SelectItem>
              <SelectItem value="autre">Autre</SelectItem>
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
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredImages.map((img) => {
            const idx = project.images.findIndex((i) => i.id === img.id);
            const canLeft = idx > 0;
            const canRight = idx < project.images.length - 1;
            return (
              <ImageCard
                key={img.id}
                img={img}
                canLeft={canLeft}
                canRight={canRight}
                templates={templates}
                onMoveImage={onMoveImage}
                onDeleteImage={onDeleteImage}
                onUpdateTag={onUpdateTag}
                onUpdateImageTemplate={onUpdateImageTemplate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ImagesTab;