import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectStatus } from "@/utils/storage";

const STATUSES: ProjectStatus[] = ["Brouillon", "En cours", "Terminé", "Archivé"];

type Props = {
  title: string;
  setTitle: (v: string) => void;
  status: ProjectStatus;
  setStatus: (v: ProjectStatus) => void;
  address: string;
  setAddress: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onSaveInfos: () => void;
};

const InfoTab = ({
  title,
  setTitle,
  status,
  setStatus,
  address,
  setAddress,
  type,
  setType,
  notes,
  setNotes,
  onSaveInfos,
}: Props) => {
  return (
    <div className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Informations du projet</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="title">Titre</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="status">Statut</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Choisir un statut" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="type">Type de bâti</Label>
            <Input id="type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Pavillon, immeuble, ..." />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes internes, remarques, contexte..." />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={onSaveInfos}>Enregistrer</Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default InfoTab;