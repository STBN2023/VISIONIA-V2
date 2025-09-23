import * as React from "react";
import type { Box } from "@/utils/runs";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  alt?: string;
  boxes?: Box[];
  className?: string;
  showLabels?: boolean;
  // Hauteur fixe pratique dans les listes (ex: 180px)
  height?: number;
};

type ImgDims = { naturalW: number; naturalH: number };

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

const AnomalyPreview: React.FC<Props> = ({ src, alt = "", boxes = [], className, showLabels = true, height = 180 }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const [imgDims, setImgDims] = React.useState<ImgDims | null>(null);
  const [, force] = React.useState(0);

  // Charge dimensions intrinsèques
  const onImgLoad = React.useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const naturalW = img.naturalWidth || img.width || 0;
    const naturalH = img.naturalHeight || img.height || 0;
    if (naturalW && naturalH) {
      setImgDims({ naturalW, naturalH });
    }
  }, []);

  // Recalcule sur resize
  React.useEffect(() => {
    const onResize = () => force((c) => c + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Calcule la zone d’affichage (object-contain) dans le conteneur
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

  function normBoxToCenterStyle(b: { x: number; y: number; w: number; h: number; angle?: number }): React.CSSProperties {
    const r = getRenderRect();
    const angle = typeof b.angle === "number" ? b.angle : 0;
    if (!r) {
      // Fallback en pourcentage, rotation autour du centre via translate(-50%,-50%)
      const left = `${(clamp01(b.x) + clamp01(b.w) / 2) * 100}%`;
      const top = `${(clamp01(b.y) + clamp01(b.h) / 2) * 100}%`;
      const width = `${clamp01(b.w) * 100}%`;
      const height = `${clamp01(b.h) * 100}%`;
      return {
        left,
        top,
        width,
        height,
        transformOrigin: "center",
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
      };
    }
    const leftPx = r.offsetX + (b.x + b.w / 2) * r.drawW;
    const topPx = r.offsetY + (b.y + b.h / 2) * r.drawH;
    const widthPx = b.w * r.drawW;
    const heightPx = b.h * r.drawH;
    return {
      left: leftPx,
      top: topPx,
      width: widthPx,
      height: heightPx,
      transformOrigin: "center",
      transform: `translate(-50%, -50%) rotate(${angle}deg)`,
    };
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden rounded-xl border border-white/15 bg-black/30", className)}
      style={{ height }}
    >
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="h-full w-full select-none object-contain"
        draggable={false}
        onLoad={onImgLoad}
      />

      {/* Calque des rectangles */}
      <div className="pointer-events-none absolute inset-0">
        {boxes.map((b) => (
          <div
            key={b.id}
            className="absolute rounded-md"
            style={{
              ...normBoxToCenterStyle(b),
              border: `2px solid ${b.color || "#22C55E"}`,
              boxShadow: "inset 0 0 0 9999px rgba(34,197,94,0.08)",
            }}
          >
            {showLabels && b.label ? (
              <div
                className="absolute -top-5 left-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none"
                style={{
                  backgroundColor: `${(b.color || "#22C55E")}33`,
                  color: "#fff",
                  border: `1px solid ${b.color || "#22C55E"}`,
                  transform: "rotate(0deg)",
                }}
              >
                {b.label}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnomalyPreview;