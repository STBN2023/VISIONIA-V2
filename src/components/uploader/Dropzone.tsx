import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type DropzoneProps = {
  onFiles: (files: FileList | File[] | null) => void;
  accept?: string;
  multiple?: boolean;
  className?: string;
  label?: string;
  hint?: string;
};

const Dropzone = ({
  onFiles,
  accept = "*",
  multiple = true,
  className,
  label = "Glissez-déposez des fichiers ici",
  hint = "ou cliquez pour sélectionner",
}: DropzoneProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOver, setIsOver] = useState(false);

  const openFile = () => inputRef.current?.click();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    onFiles(e.dataTransfer?.files ?? null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOver) setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openFile}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openFile()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-6 text-center transition-colors",
        isOver ? "border-primary bg-accent/40" : "border-muted-foreground/30 hover:border-primary",
        className,
      )}
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  );
};

export default Dropzone;