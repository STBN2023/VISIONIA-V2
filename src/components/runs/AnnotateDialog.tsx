import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import GlassDialogContent from "@/components/glass/GlassDialogContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectImage } from "@/utils/storage";
import type { Box } from "@/utils/runs";
import { Separator } from "@/components/ui/separator";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: ProjectImage;
  initialBoxes?: Box[];
  onSave: (boxes: Box[]) => void;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

const defaultColor = "#22C55E"; // emerald-500

const AnnotateDialog = ({ open, onOpenChange, image, initialBoxes = [], onSave }: Props) => {
  const [boxes, setBoxes] = React.useState<Box[]>([]);
  const [drawing, setDrawing] = React.useState(false);
  const [start, setStart] = React.useState<{ x: number; y: number } | null>(null);

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setBoxes(initialBoxes.map((b) => ({ ...b })));
  }, [initialBoxes, image.id, open]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setStart({ x: clamp01(x), y: clamp01(y) });
    setDrawing(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || !start || !containerRef.current) return;
    e.preventDefault();
    // live preview via a temporary box? Keep it simple: update a transient last box
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing || !start || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x2 = clamp01((e.clientX - rect.left) / rect.width);
    const y2 = clamp01((e.clientY - rect.top) / rect.height);
    const x = Math.min(start.x, x2);
    const y = Math.min(start.y, y2);
    const w = Math.max(0.001, Math.abs(x2 - start.x));
    const h = Math.max(0.001, Math.abs(y2 - start.y));
    setBoxes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), x, y, w, h, color: defaultColor, label: "" },
    ]);
    setStart(null);
    setDrawing(false);
  };

  const removeBox = (id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
  };

  const updateBox = (id: string, patch: Partial<Box>) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const cancelDrawing = () => {
    setDrawing(false);
    setStart(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancelDrawing(); onOpenChange(o); }}>
      <GlassDialogContent className="max-w-5xl">
        <div className="mb-3">
          <h3 className="text-lg font-semibold">Annoter l’image</h3>
          <p className="text-sm text-white/70">Cliquez-glissez pour dessiner un rectangle. Ajustez la couleur et le libellé ci-dessous.</p>
        </div>

        <div
          ref={containerRef}
          className="relative mx-auto aspect-[4/3] w-full max-h-[70vh] overflow-hidden rounded-2xl border border-white/20 bg-black/30"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={cancelDrawing}
        >
          <img
            src={image.dataUrl}
            alt={image.name}
            className="h-full w-full object-contain select-none"
            draggable={false}
          />
          {/* Calque des rectangles existants */}
          <div className="pointer-events-none absolute inset-0">
            {boxes.map((b) => (
              <div
                key={b.id}
                className="absolute rounded-md"
                style={{
                  left: `${b.x * 100}%`,
                  top: `${b.y * 100}%`,
                  width: `${b.w * 100}%`,
                  height: `${b.h * 100}%`,
                  border: `2px solid ${b.color || defaultColor}`,
                  boxShadow: `0 0 0 9999px rgba(0,0,0,0)`,
                }}
              >
                {b.label ? (
                  <div
                    className="pointer-events-none absolute -top-6 left-0 rounded-md px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: `${b.color || defaultColor}33`,
                      color: "#fff",
                      border: `1px solid ${b.color || defaultColor}`,
                    }}
                  >
                    {b.label}
                  </div>
                ) : null}
              </div>
            ))}
            {/* Aperçu du rectangle en cours de tracé */}
            {drawing && start ? (
              <div
                className="absolute rounded-md border-2"
                style={{
                  left: `${start.x * 100}%`,
                  top: `${start.y * 100}%`,
                  width: `0px`,
                  height: `0px`,
                  borderColor: defaultColor,
                }}
              />
            ) : null}
          </div>
        </div>

        <Separator className="my-4 border-white/20" />

        <div className="grid gap-3">
          {boxes.length === 0 ? (
            <p className="text-sm text-white/70">Aucun rectangle pour le moment. Dessinez-en un sur l’image.</p>
          ) : (
            boxes.map((b) => (
              <div key={b.id} className="grid gap-2 rounded-xl border border-white/20 bg-white/5 p-3 md:grid-cols-[1fr,160px,auto] md:items-center">
                <div className="grid gap-1">
                  <Label htmlFor={`label-${b.id}`}>Libellé</Label>
                  <Input
                    id={`label-${b.id}`}
                    placeholder="Ex: fissure, pont thermique…"
                    value={b.label ?? ""}
                    onChange={(e) => updateBox(b.id, { label: e.target.value })}
                    className="bg-white/10 text-white placeholder:text-white/60"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`color-${b.id}`}>Couleur</Label>
                  <input
                    id={`color-${b.id}`}
                    type="color"
                    value={b.color || defaultColor}
                    onChange={(e) => updateBox(b.id, { color: e.target.value })}
                    className="h-10 w-16 cursor-pointer rounded-md border border-white/20 bg-transparent p-0"
                  />
                </div>
                <div className="flex items-end md:justify-end">
                  <Button variant="ghost" className="text-white/90 hover:bg-white/10" onClick={() => removeBox(b.id)}>
                    Supprimer
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" className="backdrop-blur-sm" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="backdrop-blur-sm"
            onClick={() => {
              onSave(boxes);
              onOpenChange(false);
            }}
          >
            Enregistrer
          </Button>
        </div>
      </GlassDialogContent>
    </Dialog>
  );
};

export default AnnotateDialog;