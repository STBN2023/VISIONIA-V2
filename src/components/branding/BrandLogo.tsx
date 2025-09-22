import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: number; // pixels
  alt?: string;
  src?: string; // permet de surcharger la source si besoin
};

const BrandLogo: React.FC<Props> = ({
  className,
  size = 28,
  alt = "Logo ISOEDRE",
  src: initialSrc = "/logo-isoedre.png",
}) => {
  const [src, setSrc] = React.useState<string>(initialSrc);

  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn(
        "rounded-md object-contain drop-shadow",
        className
      )}
      draggable={false}
      decoding="async"
      loading="eager"
      onError={() => {
        console.warn("[BrandLogo] Impossible de charger", src, "→ fallback placeholder.svg");
        setSrc("/placeholder.svg");
      }}
      style={{ width: size, height: size }}
    />
  );
};

export default BrandLogo;