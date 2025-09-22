import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  height?: number; // hauteur en px (largeur auto)
  width?: number; // optionnel: force la largeur
  alt?: string;
  src?: string; // source prioritaire si fournie
};

const BrandLogo: React.FC<Props> = ({
  className,
  height = 32,
  width,
  alt = "Logo",
  src: preferredSrc = "/favicon-96x96.png",
}) => {
  const candidates = React.useMemo(() => {
    // Ordre de priorité: demandé par l'utilisateur → fichiers connus du projet → placeholder
    const list = [
      preferredSrc,
      "/logo-isoedre.png",
      "/web-app-manifest-512x512.png",
      "/favicon.ico",
      "/placeholder.svg",
    ].filter(Boolean);
    // Évite les doublons
    return Array.from(new Set(list));
  }, [preferredSrc]);

  const [idx, setIdx] = React.useState(0);
  const src = candidates[Math.min(idx, candidates.length - 1)];

  const handleError = () => {
    const next = idx + 1;
    if (next < candidates.length) {
      console.warn("[BrandLogo] Échec de chargement", candidates[idx], "→ tentative suivante", candidates[next]);
      setIdx(next);
    } else {
      console.warn("[BrandLogo] Toutes les sources ont échoué, dernier fallback utilisé:", candidates[idx]);
    }
  };

  return (
    <img
      src={src}
      alt={alt}
      className={cn("object-contain drop-shadow", className)}
      draggable={false}
      decoding="async"
      loading="eager"
      onError={handleError}
      style={{
        height,
        width: width ?? "auto",
        display: "block",
      }}
    />
  );
};

export default BrandLogo;