import * as React from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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

type ImgDims = { naturalW: number; naturalH: number };

const AnnotateDialog = ({ open, onOpenChange, image, initialBoxes = [], onSave }: Props) => {
  const [boxes, setBoxes] = React.useState<Box[]>([]);
  const [drawing, setDrawing] = React.useState(false);
  const [start, setStart] = React.useState<{ x: number; y: number } | null>(null);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const [imgDims, setImgDims] = React.useState<ImgDims | null>(null);

  React.useEffect(() => {
    setBoxes(initialBoxes.map((b) => ({ ...b })));
  }, [initialBoxes, image.id, open]);

  // Charge dimensions intrinsèques de l'image
  const onImgLoad = React.useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const naturalW = img.naturalWidth || img.width || 0;
    const naturalH = img.naturalHeight || img.height || 0;
    if (naturalW && naturalH) {
      setImgDims({ naturalW, naturalH });
    }
  }, []);

  // Calcule la zone affichée réelle de l'image (object-contain) dans le conteneur
  function getRenderRect() {
    const cont = containerRef.current;
    if (!cont || !imgDims) return null;
    const rect = cont.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const { naturalW: iw, naturalH: ih } = imgDims;
    if (!cw || !ch || !iw || !ih) return null;

    const scale = Math.min(cw / iw, ch / ih);
    const drawW = iw * scale;
    const drawH = ih * scale;
    const offsetX = (cw - drawW) / 2;
    const offsetY = (ch - drawH) / 2;

    return { offsetX, offsetY, drawW, drawH, contRect: rect };
  }

  // Convertit un point client vers coords normalisées image (0..1)
  function clientToNorm(e: React.PointerEvent) {
    const r = getRenderRect();
    if (!r) return null;
    const xPx = e.clientX - r.contRect.left - r.offsetX;
    const yPx = e.clientY - r.contRect.top - r.offsetY;
    if (xPx < 0 || yPx < 0 || xPx > r.drawW || yPx > r.drawH) {
      return null; // en dehors de l'image affichée
    }
    const nx = clamp01(xPx / r.drawW);
    const ny = clamp01(yPx / r.drawH);
    return { x: nx, y: ny };
  }

  // Convertit une box normalisée (0..1) en style pixels dans le conteneur
  function normBoxToStyle(b: Box): React.CSSProperties {
    const r = getRenderRect();
    if (!r) {
      // Fallback ancien comportement (moins précis)
      return {
        left: `${b.x * 100}%`,
        top: `${b.y * 100}%`,
        width: `${b.w * 100}%`,
        height: `${b.h * 100}%`,
      };
    }
    const left = r.offsetX + b.x * r.drawW;
    const top = r.offsetY + b.y * r.drawH;
    const width = b.w * r.drawW;
    const height = b.h * r.drawH;
    return {
      left,
      top,
      width,
      height,
    };
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = clientToNorm(e);
    if (!p) return; // ignore si on clique dans les bandes
    setStart(p);
    setDrawing(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || !start) return;
    // Optionnel: aperçu live du rectangle (non nécessaire ici)
    e.preventDefault();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing || !start) return;
    const p = clientToNorm(e);
    setDrawing(false);
    if (!p) {
      setStart(null);
      return;
    }
    const x = Math.min(start.x, p.x);
    const y = Math.min(start.y, p.y);
    const w = Math.max(0.001, Math.abs(p.x - start.x));
    const h = Math.max(0.001, Math.abs(p.y - start.y));
    setBoxes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), x, y, w, h, color: defaultColor, label: "" },
    ]);
    setStart(null);
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
        <DialogHeader>
          <DialogTitle>Annoter l’image</DialogTitle>
          <DialogDescription>Cliquer-glisser dans l’image (pas les bandes) pour dessiner un rectangle, puis ajuster couleur et libellé.</DialogDescription>
        </DialogHeader>

        <div
          ref={containerRef}
          className="relative mx-auto aspect-[4/3] w-full max-h-[70vh] overflow-hidden rounded-2xl border border-white/20 bg-black/30"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
          onPointerLeave={cancelDrawing}
        >
          <img
            ref={imgRef}
            src={image.dataUrl}
            alt={image.name}
            className="h-full w-full select-none object-contain"
            draggable={false}
            onLoad={onImgLoad}
          />
          {/* Calque des rectangles existants */}
          <div className="pointer-events-none absolute inset-0">
            {boxes.map((b) => (
              <div
                key={b.id}
                className="absolute rounded-md"
                style={{
                  ...normBoxToStyle(b),
                  border: `2px solid ${b.color || defaultColor}`,
                }}
              >
                {b.label ? (
                  <div
                    className="pointer-events-none absolute -top-6 left-0 rounded-md px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: `${(b.color || defaultColor)}33`,
                      color: "#fff",
                      border: `1px solid ${b.color || defaultColor}`,
                    }}
                  >
                    {b.label}
                  </div>
                ) : null}
              </div>
            ))}
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