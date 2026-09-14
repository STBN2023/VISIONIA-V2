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
  // Utilise par défaut le fichier présent dans /public
  src: preferredSrc = "/logo.png",
}) => {
  const candidates = React.useMemo(() => {
    // Ordre de priorité: src fourni → logo → favicon → placeholder.
    // Ce repli est silencieux : logo-isoedre.png n'était pas une image (du
    // texte enregistré en .png) et le composant affichait le favicon à sa
    // place sans que personne ne s'en aperçoive. D'où l'avertissement console
    // ci-dessous, seul signal en cas de source manquante.
    const list = [
      preferredSrc,
      "/logo.png",
      "/favicon.ico",
      "/placeholder.svg",
    ].filter(Boolean);
    return Array.from(new Set(list));
  }, [preferredSrc]);

  const [idx, setIdx] = React.useState(0);
  const src = candidates[Math.min(idx, candidates.length - 1)];

  const handleError = () => {
    const next = idx + 1;
    if (next < candidates.length) {
      // Tente simplement le suivant, sans bruit inutile
      setIdx(next);
    } else {
      // Avertit seulement si toutes les sources échouent
      console.warn("[BrandLogo] Impossible de charger le logo depuis:", candidates);
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