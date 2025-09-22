import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export const GlassShell = ({ children, className }: Props) => {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-900 dark:via-slate-950 dark:to-black",
        className,
      )}
    >
      {/* Auras colorées */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
      </div>
      {/* Trame discrète */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-[radial-gradient(#0000000a_1px,transparent_1px)] [background-size:22px_22px] dark:bg-[radial-gradient(#ffffff0d_1px,transparent_1px)]" />
      </div>

      {/* Contenu */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};