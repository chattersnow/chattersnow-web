import Image from "next/image";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";

/**
 * Event fliers are artwork, not photography: they are made in whatever shape
 * the designer felt like that week -- square, 4:5, a tall story graphic -- and
 * every one of them carries text (the meetup time, the venue, the sponsor
 * logos) right up to its edges. `object-cover` in a fixed 16:9 box therefore
 * cropped the message off the top and bottom of the flier on the listing
 * cards, the home page and the detail page (#1035).
 *
 * Nothing here crops. The tile keeps the grid's uniform 16:9 cell but contains
 * the flier inside it over a blurred, enlarged copy of itself, so a portrait
 * flier reads whole against its own colours instead of grey bars; the detail
 * view drops the fixed box altogether and lets the flier take its natural
 * shape.
 */

/** How wide the flier will be laid out, for the `sizes` srcset hint. */
type FlierProps = {
  flierUrl: string | null;
  sizes: string;
};

/**
 * The flier as a card's artwork: a fixed 16:9 cell so a grid of cards lines
 * up, with the whole flier contained inside it. `children` is for anything
 * that sits on top of the artwork, like the home page's "Next up" ribbon.
 */
export function EventFlierTile({
  flierUrl,
  sizes,
  children,
}: FlierProps & { children?: React.ReactNode }) {
  const imageUrl = resolveImageUrl(flierUrl);

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
      {isRenderableImageSrc(imageUrl) ? (
        <>
          {/* The backdrop is the flier itself, blown up and blurred past
              legibility -- it only exists to fill the cell with the artwork's
              own palette, so it is hidden from assistive tech. */}
          <Image
            src={imageUrl}
            alt=""
            aria-hidden
            fill
            sizes={sizes}
            className="scale-110 object-cover blur-xl"
          />
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes={sizes}
            className="object-contain"
          />
        </>
      ) : (
        <BrandImageFallback label="Flier coming soon" />
      )}
      {children}
    </div>
  );
}

/**
 * The flier on a detail view, at its own aspect ratio. `max-h` keeps a tall
 * poster from pushing the event's date and registration form off the first
 * screen, and `w-auto`/`h-auto` mean a flier smaller than the column keeps
 * its real size rather than being upscaled into mush. A flier narrower than
 * its column starts on the column's left edge, where the page's heading, date
 * and form all start.
 */
export function EventFlierFull({
  flierUrl,
  sizes,
  alt,
  priority,
}: FlierProps & {
  alt: string;
  priority?: boolean;
}) {
  const imageUrl = resolveImageUrl(flierUrl);
  if (!isRenderableImageSrc(imageUrl)) return null;

  return (
    // No background on the frame: a portrait flier in a wide column would
    // otherwise sit between two grey rails. Letterboxing is what the tile
    // above uses the blurred backdrop to avoid, and here there is nothing to
    // fill -- the flier simply takes the width it needs.
    <div className="flex justify-start">
      <Image
        src={imageUrl}
        alt={alt}
        // Nominal dimensions: the rendered size comes from the CSS below and
        // the flier's real intrinsic ratio, and these only reserve a square
        // while it loads. next/image requires them whenever `fill` is off.
        width={1000}
        height={1000}
        sizes={sizes}
        priority={priority}
        className="h-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
      />
    </div>
  );
}
