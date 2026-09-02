import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandImageFallbackProps = {
  /** Optional caption, e.g. "Photo coming soon". Omit for a logo-only tile. */
  label?: string;
  className?: string;
};

/**
 * Branded stand-in for a missing image (an event without a flier, gear without
 * a photo). Fills its positioned parent, so it drops straight into the same
 * aspect-ratio box the real <Image> would have occupied. The mark and accent
 * are sized proportionally so it reads well from a cart thumbnail up to a
 * full-width hero.
 */
export function BrandImageFallback({
  label,
  className,
}: BrandImageFallbackProps) {
  return (
    <div
      style={{ backgroundImage: "var(--rainbow-soft)" }}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-secondary px-4 py-3 text-center",
        className,
      )}
    >
      <span className="rainbow-accent w-1/4 max-w-12" aria-hidden />
      <Image
        src="/chatter-logo-transparent.png"
        alt=""
        width={643}
        height={492}
        className="h-auto w-1/2 max-w-16 opacity-70"
        aria-hidden
      />
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}
