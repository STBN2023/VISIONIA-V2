import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  height?: number; // hauteur en px (largeur auto pour respecter le ratio)
  width?: number; // optionnel: si fourni, force la largeur
  alt?: string;
  src?: string; // source personnalisable
};

const BrandLogo: React.FC<Props> = ({
  className,
  height = 32,
  width,
  alt = "Logo ISOEDRE",
  src: initialSrc = "/logo-isoedre.png",
}) => {
  const [src, setSrc] = React.useState<string>(initialSrc);

  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      src={src}
      alt={alt}
      className={cn("object-contain drop-shadow", className)}
      draggable={false}
      decoding="async"
      loading="eager"
      onError={() => {
        console.warn("[BrandLogo] Impossible de charger", src, "→ fallback placeholder.svg");
        setSrc("/placeholder.svg");
      }}
      style={{
        height,
        width: width ?? "auto",
        display: "block",
      }}
    />
  );
};

export default BrandLogo;