import { useState } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeftCircle, ArrowRightCircle, Trash2, ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { ImageTag, ProjectImage } from "@/utils/storage";
import type { PromptTemplate } from "@/utils/prompts";

type Props = {
  img: ProjectImage;
  canLeft: boolean;
  canRight: boolean;
  templates: PromptTemplate[];
  availableTags: string[];
  onMoveImage: (imgId: string, direction: "left" | "right") => void;
  onDeleteImage: (imgId: string) => void;
  onUpdateTag: (imgId: string, tag?: ImageTag) => void;
  onUpdateImageTemplate: (imgId: string, templateId?: string) => void;
  onCreateTag: (label: string) => void;
};

const ImageCard = ({
  img,
  canLeft,
  canRight,
  templates,
  availableTags,
  onMoveImage,
  onDeleteImage,
  onUpdateTag,
  onUpdateImageTemplate,
  onCreateTag,
}: Props) => {
  const [openOptions, setOpenOptions] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newTag, setNewTag] = useState("");

  const addTag = () => {
    const label = newTag.trim();
    if (!label) return;
    if (!availableTags.includes(label)) {
      onCreateTag(label);
    }
    onUpdateTag(img.id, label);
    setNewTag("");
  };

  return (
    <>
      <Card className="overflow-hidden rounded-3xl border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur-2xl">
        <div className="relative aspect-[4/3] w-full bg-white/5">
          <img
            src={img.dataUrl}
            alt={img.name}
            className="h-full w-full cursor-zoom-in object-cover"
            draggable={false}
            onClick={() => setPreviewOpen(true)}
          />
        </div>

        <CardContent className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{img.name}</p>
              <p className="truncate text-[11px] text-white/70">
                {(img.size / 1024).toFixed(0)} Ko • {new Date(img.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                disabled={!canLeft}
                onClick={() => onMoveImage(img.id, "left")}
                title="Déplacer à gauche"
                className="hover:bg-white/10"
              >
                <ArrowLeftCircle className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={!canRight}
                onClick={() => onMoveImage(img.id, "right")}
                title="Déplacer à droite"
                className="hover:bg-white/10"
              >
                <ArrowRightCircle className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDeleteImage(img.id)}
                title="Supprimer"
                className="hover:bg-white/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {openOptions ? (
            <div className="space-y-3 pt-1">
              <div className="grid gap-2">
                <Label className="text-xs">Tag</Label>
                <Select
                  value={img.tag ?? "none"}
                  onValueChange={(v) => onUpdateTag(img.id, v === "none" ? undefined : (v as ImageTag))}
                >
                  <SelectTrigger className="h-8 bg-white/10 text-white">
                    <SelectValue placeholder="Choisir un tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {availableTags.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Nouveau tag"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    className="h-8 bg-white/10 text-white placeholder:text-white/60"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addTag} className="border-white/30 text-white hover:bg-white/10">
                    <Plus className="mr-1 h-4 w-4" />
                    Ajouter
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Template (image)</Label>
                <Select
                  value={img.templateId ?? "inherit"}
                  onValueChange={(v) =>
                    onUpdateImageTemplate(img.id, v === "inherit" ? undefined : v)
                  }
                >
                  <SelectTrigger className="h-8 bg-white/10 text-white">
                    <SelectValue placeholder="Hériter du projet" />
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
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="p-2">
          <Button
            variant="secondary"
            className="w-full justify-between backdrop-blur-sm"
            onClick={() => setOpenOptions((v) => !v)}
          >
            {openOptions ? "Masquer les options" : "Afficher les options"}
            {openOptions ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl border-0 p-0">
          <img
            src={img.dataUrl}
            alt={img.name}
            className="h-[80vh] w-full object-contain"
            onClick={() => setPreviewOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImageCard;