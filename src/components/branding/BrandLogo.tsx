import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: number; // en pixels
  alt?: string;
};

const BrandLogo: React.FC<Props> = ({ className, size = 24, alt = "Logo ISOEDRE" }) => {
  const [src, setSrc] = React.useState<string>("/logo-isoedre.png");

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-md", className)}
      draggable={false}
      decoding="async"
      loading="eager"
      onError={() => setSrc("/placeholder.svg")}
    />
  );
};

export default BrandLogo;