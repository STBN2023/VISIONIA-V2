import React from "react";
import { cn } from "@/lib/utils";
import { getSettings } from "@/utils/settings";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export const GlassShell = ({ children, className }: Props) => {
  const initial = getSettings();
  const [bgUrl, setBgUrl] = React.useState<string>(
    initial.backgroundImage ||
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=2400&auto=format&fit=crop",
  );
  const [dim, setDim] = React.useState<number>(typeof initial.backgroundDim === "number" ? initial.backgroundDim : 20);

  React.useEffect(() => {
    const onUpdated = () => {
      const s = getSettings();
      setBgUrl(s.backgroundImage || "");
      setDim(typeof s.backgroundDim === "number" ? s.backgroundDim : 20);
    };
    window.addEventListener("settings:updated", onUpdated);
    return () => window.removeEventListener("settings:updated", onUpdated);
  }, []);

  const dimClamped = Math.max(0, Math.min(100, Number.isFinite(dim) ? dim : 20));
  const alpha = (dimClamped / 100) * 0.7; // voile sombre max ~70%

  return (
    <div className={cn("relative min-h-screen overflow-hidden text-white", className)}>
      {/* Dégradé sombre de base */}
      <div className="fixed inset-0 -z-30">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950" />
      </div>

      {/* Image de fond paramétrable */}
      <div className="fixed inset-0 -z-20">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: bgUrl ? `url('${bgUrl}')` : undefined,
            opacity: 0.2,
          }}
        />
      </div>

      {/* Voile sombre (contraste) */}
      <div
        className="fixed inset-0 -z-10"
        style={{ backgroundColor: `rgba(0,0,0,${alpha.toFixed(3)})` }}
      />

      {/* Halos lumineux */}
      <div className="pointer-events-none fixed -top-24 -right-24 -z-10 h-[34rem] w-[34rem] rounded-full bg-gradient-to-br from-blue-400/25 to-transparent blur-3xl" />
      <div className="pointer-events-none fixed -bottom-24 -left-24 -z-10 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-fuchsia-400/25 to-transparent blur-3xl" />

      {/* Trame discrète */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff14_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      {/* Contenu */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};