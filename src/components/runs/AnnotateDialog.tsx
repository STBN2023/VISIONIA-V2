import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import GlassDialogContent from "@/components/glass/GlassDialogContent";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import type { ProjectImage } from "@/utils/storage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: ProjectImage | null;
  initialBoxes: any[]; // Remplacez par le type approprié
  onSave: (newBoxes: any[]) => void; // Remplacez par le type approprié
};

const AnnotateDialog = ({ open, onOpenChange, image, initialBoxes, onSave }: Props) => {
  const [boxes, setBoxes] = useState(initialBoxes);

  useEffect(() => {
    setBoxes(initialBoxes);
  }, [initialBoxes]);

  const handleSave = () => {
    onSave(boxes);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Annoter l'image</DialogTitle>
          <DialogDescription>Ajoutez des annotations à l'image.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Ajoutez ici votre logique pour afficher et gérer les annotations */}
          <div>
            <p>Image: {image?.name}</p>
            {/* Affichez les boxes ici */}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={handleSave}>Enregistrer</Button>
          </div>
        </div>
      </GlassDialogContent>
    </Dialog>
  );
};

export default AnnotateDialog;