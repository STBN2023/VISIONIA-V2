import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
};

const GlassPanel = ({ children, className }: Props) => {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl backdrop-blur-md transition",
        "dark:border-white/10 dark:bg-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
};

export default GlassPanel;