import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { ImagePlaceholder } from "@/components/image-placeholder";
import { cn } from "@/lib/utils";

type SiteImageProps = {
  url: string | null;
  alt: string;
  icon?: LucideIcon;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

/** Renders an admin-configured site image, falling back to the icon placeholder when unset. */
export function SiteImage({
  url,
  alt,
  icon,
  className,
  sizes,
  priority,
}: SiteImageProps) {
  if (!url) {
    return <ImagePlaceholder icon={icon} className={className} />;
  }

  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes ?? "100vw"}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
