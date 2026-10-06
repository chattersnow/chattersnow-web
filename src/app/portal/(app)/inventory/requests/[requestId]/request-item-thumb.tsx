import Image from "next/image";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import { resolveImageUrl } from "@/lib/inventory";
import { cn } from "@/lib/utils";

/** An item's photo at row size, or the brand fallback when it has none. */
export function RequestItemThumb({
  photoUrl,
  className,
}: {
  photoUrl: string | null;
  className?: string;
}) {
  const imageUrl = resolveImageUrl(photoUrl);
  return (
    <div
      className={cn(
        "relative size-12 shrink-0 overflow-hidden rounded-md bg-muted",
        className,
      )}
    >
      {imageUrl ? (
        // Decorative: the description sits beside it.
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="48px"
          className="object-cover"
        />
      ) : (
        <BrandImageFallback className="gap-0 px-1 py-1" />
      )}
    </div>
  );
}
