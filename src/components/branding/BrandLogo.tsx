import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  height?: number; // hauteur en px (largeur auto pour respecter le ratio)
  width?: number; // optionnel: force la largeur
  alt?: string;
  src?: string; // permet de surcharger la source
};

const BrandLogo: React.FC<Props> = ({
  className,
  height = 32,
  width,
  alt = "Logo",
  src: initialSrc = "/favicon-96x96.png",
}) => {
  const [src, setSrc] = React.useState<string>(initialSrc);

  return (
    <img
      src={src}
      alt={alt}
      className={cn("object-contain drop-shadow", className)}
      draggable={false}
      decoding="async"
      loading="eager"
      onError={() => {
        console.warn("[BrandLogo] Échec de chargement", src, "→ fallback placeholder.svg");
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