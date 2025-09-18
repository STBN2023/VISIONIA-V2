import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

type Props = {
  onCreate: (data: { title: string; address?: string; type?: string }) => void;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const ProjectFormDialog = ({ onCreate, triggerLabel = "Nouveau projet", open: openProp, onOpenChange }: Props) => {
  const [localOpen, setLocalOpen] = useState(false);
  const controlled = typeof openProp === "boolean";
  const open = controlled ? (openProp as boolean) : localOpen;
  const setOpen = controlled ? onOpenChange ?? (() => {}) : setLocalOpen;

  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState("");

  const canSubmit = title.trim().length > 2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onCreate({ title: title.trim(), address: address.trim() || undefined, type: type.trim() || undefined });
    setOpen(false);
    setTitle("");
    setAddress("");
    setType("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Titre</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Maison individuelle - Dupont" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue des Fleurs, Lyon" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Type de bâti</Label>
            <Input id="type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Pavillon, immeuble, ..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Créer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectFormDialog;