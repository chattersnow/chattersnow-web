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
  /**
   * Passed through to `next/image`. Worth setting to "eager" for an image that
   * is in the DOM but out of view and about to be shown without a scroll --
   * a carousel slide that advances on its own is the case that needs it, since
   * a lazy one is not fetched until it intersects and so arrives blank.
   */
  loading?: "eager" | "lazy";
};

/** Renders an admin-configured site image, falling back to the icon placeholder when unset. */
export function SiteImage({
  url,
  alt,
  icon,
  className,
  sizes,
  priority,
  loading,
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
        loading={loading}
        className="object-cover"
      />
    </div>
  );
}
