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
        "rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl",
        "dark:border-white/20 dark:bg-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
};

export default GlassPanel;