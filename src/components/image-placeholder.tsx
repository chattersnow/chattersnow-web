import type { LucideIcon } from "lucide-react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ImagePlaceholderProps = {
  icon?: LucideIcon;
  className?: string;
};

export function ImagePlaceholder({
  icon: Icon = ImageIcon,
  className,
}: ImagePlaceholderProps) {
  return (
    <div
      className={cn(
        "flex aspect-square w-full items-center justify-center rounded-lg bg-muted ring-1 ring-foreground/10",
        className,
      )}
    >
      <Icon className="size-12 text-muted-foreground/50" aria-hidden />
    </div>
  );
}
