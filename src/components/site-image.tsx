import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { ImagePlaceholder } from "@/components/image-placeholder";
import {
  boostThumbnail,
  cropBoxStyle,
  cropObjectPosition,
  parseImageCrop,
  scaleSizes,
} from "@/lib/image-crop";
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

/**
 * Renders an admin-configured site image, falling back to the icon placeholder
 * when unset.
 *
 * The stored value may carry a `#crop=` fragment (`src/lib/image-crop.ts`).
 * With one, the image is laid out in a box scaled and offset so the crop rect
 * lands on the frame; without one the DOM is exactly what it has always been,
 * a plain `object-cover` fill. Note that a stored rect is only exact at the
 * frame aspect it was authored at -- see the module comment on `image-crop.ts`
 * before filing the phone rendering of `/get-involved` as a bug.
 */
export function SiteImage({
  url,
  alt,
  icon,
  className,
  sizes,
  priority,
  loading,
}: SiteImageProps) {
  const { src, crop } = parseImageCrop(url);

  if (!src) {
    return <ImagePlaceholder icon={icon} className={className} />;
  }

  const frame = cn(
    "relative aspect-square w-full overflow-hidden rounded-lg bg-muted",
    className,
  );

  if (!crop) {
    return (
      <div className={frame}>
        <Image
          src={src}
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

  return (
    <div className={frame}>
      <div className="absolute" style={cropBoxStyle(crop)}>
        <Image
          src={boostThumbnail(src, crop)}
          alt={alt}
          fill
          sizes={scaleSizes(sizes ?? "100vw", 1 / crop.w)}
          priority={priority}
          loading={loading}
          className="object-cover"
          style={{ objectPosition: cropObjectPosition(crop) }}
        />
      </div>
    </div>
  );
}
