import React from "react";
import { cn } from "@/lib/utils";
import { getSettings } from "@/utils/settings";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export const GlassShell = ({ children, className }: Props) => {
  const initial = getSettings();

  const [mode, setMode] = React.useState<"image" | "color">(
    initial.backgroundMode ?? "image",
  );
  const [bgUrl, setBgUrl] = React.useState<string>(
    initial.backgroundImage ||
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=2400&auto=format&fit=crop",
  );
  const [bgColor, setBgColor] = React.useState<string>(
    initial.backgroundColor || "#0b1220",
  );
  const [dim, setDim] = React.useState<number>(
    typeof initial.backgroundDim === "number" ? initial.backgroundDim : 20,
  );
  const [theme, setTheme] = React.useState<"violet" | "blue" | "neutral">(
    (initial.themePreset as any) || "violet",
  );
  const [brightness, setBrightness] = React.useState<number>(
    typeof initial.brightness === "number" ? initial.brightness : 100,
  );

  React.useEffect(() => {
    const onUpdated = () => {
      const s = getSettings();
      setMode((s.backgroundMode as "image" | "color") ?? "image");
      setBgUrl(s.backgroundImage || "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=2400&auto=format&fit=crop");
      setBgColor(s.backgroundColor || "#0b1220");
      setDim(typeof s.backgroundDim === "number" ? s.backgroundDim : 20);
      setTheme((s.themePreset as any) || "violet");
      setBrightness(typeof s.brightness === "number" ? s.brightness : 100);
    };
    window.addEventListener("settings:updated", onUpdated);
    return () => window.removeEventListener("settings:updated", onUpdated);
  }, []);

  const dimClamped = Math.max(0, Math.min(100, Number.isFinite(dim) ? dim : 20));
  const alpha = (dimClamped / 100) * 0.7; // voile sombre max ~70%

  const brightClamped = Math.max(50, Math.min(150, Number.isFinite(brightness) ? brightness : 100));

  const themeConf = {
    violet: {
      base: "from-indigo-950 via-purple-950 to-slate-950",
      halo1: "from-blue-400/25",
      halo2: "from-fuchsia-400/25",
    },
    blue: {
      base: "from-slate-950 via-blue-950 to-slate-950",
      halo1: "from-sky-400/25",
      halo2: "from-cyan-400/25",
    },
    neutral: {
      base: "from-slate-950 via-gray-950 to-slate-950",
      halo1: "from-gray-400/25",
      halo2: "from-gray-400/25",
    },
  }[theme];

  return (
    <div className={cn("relative min-h-screen overflow-hidden text-white", className)}>
      {/* Dégradé sombre de base (teinte selon le thème) */}
      <div className="fixed inset-0 -z-30">
        <div className={cn("absolute inset-0 bg-gradient-to-br", themeConf.base)} />
      </div>

      {/* Couche arrière-plan: image ou couleur (avec luminosité) */}
      <div
        className="fixed inset-0 -z-20"
        style={{ filter: `brightness(${brightClamped}%)` }}
      >
        {mode === "image" ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: bgUrl ? `url('${bgUrl}')` : undefined,
              opacity: 0.2,
            }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: bgColor || "#0b1220" }}
          />
        )}
      </div>

      {/* Voile sombre (contraste) */}
      <div
        className="fixed inset-0 -z-10"
        style={{ backgroundColor: `rgba(0,0,0,${alpha.toFixed(3)})` }}
      />

      {/* Halos lumineux (couleurs selon le thème) */}
      <div className={cn("pointer-events-none fixed -top-24 -right-24 -z-10 h-[34rem] w-[34rem] rounded-full bg-gradient-to-br to-transparent blur-3xl", themeConf.halo1)} />
      <div className={cn("pointer-events-none fixed -bottom-24 -left-24 -z-10 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br to-transparent blur-3xl", themeConf.halo2)} />

      {/* Trame discrète */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff14_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      {/* Contenu */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};