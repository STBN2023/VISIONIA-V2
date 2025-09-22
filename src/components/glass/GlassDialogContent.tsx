import * as React from "react";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type GlassDialogContentProps = React.ComponentProps<typeof DialogContent>;

const GlassDialogContent = React.forwardRef<HTMLDivElement, GlassDialogContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <DialogContent
        ref={ref}
        className={cn(
          "rounded-3xl border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur-2xl",
          "ring-1 ring-white/10",
          className
        )}
        {...props}
      >
        {children}
      </DialogContent>
    );
  }
);

GlassDialogContent.displayName = "GlassDialogContent";

export default GlassDialogContent;