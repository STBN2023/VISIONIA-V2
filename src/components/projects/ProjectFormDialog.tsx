import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import GlassDialogContent from "@/components/glass/GlassDialogContent";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

type CreatePayload = { title: string; address?: string; type?: string };

type Props = {
  onCreate: (data: CreatePayload) => void | Promise<void>;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean; // nouveau: permet de ne pas afficher le bouton interne
};

const ProjectFormDialog = ({ onCreate, triggerLabel = "Nouveau projet", open: openProp, onOpenChange, hideTrigger = false }: Props) => {
  const [localOpen, setLocalOpen] = useState(false);
  const controlled = typeof openProp === "boolean";
  const open = controlled ? (openProp as boolean) : localOpen;
  const setOpen = controlled ? onOpenChange ?? (() => {}) : setLocalOpen;

  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim().length > 2 && !submitting;

  const resetForm = () => {
    setTitle("");
    setAddress("");
    setType("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await Promise.resolve(
        onCreate({
          title: title.trim(),
          address: address.trim() || undefined,
          type: type.trim() || undefined,
        }),
      );
      setOpen(false);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      ) : null}
      <GlassDialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
          <DialogDescription>Renseignez les informations du projet puis validez pour le créer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid gap-2">
            <Label htmlFor="title">Titre</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Maison individuelle - Dupont" className="bg-white/10 text-white placeholder:text-white/60" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue des Fleurs, Lyon" className="bg-white/10 text-white placeholder:text-white/60" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Type de bâti</Label>
            <Input id="type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Pavillon, immeuble, ..." className="bg-white/10 text-white placeholder:text-white/60" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={submitting} className="backdrop-blur-sm">
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit} className="backdrop-blur-sm">
              {submitting ? "Création..." : "Créer"}
            </Button>
          </div>
        </form>
      </GlassDialogContent>
    </Dialog>
  );
};

export default ProjectFormDialog;