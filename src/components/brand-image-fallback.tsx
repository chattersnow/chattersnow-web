"use client";

import { BrandLogo } from "@/components/brand-logo";
import { useBrandLogoUrl } from "@/components/brand-logo-context";
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
 *
 * The mark is the tenant's own, from `BrandLogoProvider`, and `BrandLogo`'s
 * drawn placeholder where they have set none. It used to be
 * `/chatter-logo-transparent.png` hardcoded -- one organization's actual logo,
 * shipped as every organization's default. #795 Phase 3 took that out of
 * `BrandLogo` and left it here, so the demo tenant, and any white-label tenant,
 * got its own neutral mark in the header and Chatter Snow's in every flier and
 * gear tile below it: two placeholders on one page disagreeing about whose site
 * it is.
 *
 * The wash behind it needed no such fix -- `--rainbow-soft` is emitted per
 * tenant from `brand.accent_stops` (see `brandingCss`), so a tenant with its
 * own stops already gets its own.
 *
 * The 4:3 box is the ratio the hardcoded file rendered at, so a tenant that has
 * uploaded a logo gets it contained in the space the mark already occupied and
 * nothing moves.
 */
export function BrandImageFallback({
  label,
  className,
}: BrandImageFallbackProps) {
  const logoUrl = useBrandLogoUrl();
  return (
    <div
      style={{ backgroundImage: "var(--rainbow-soft)" }}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-secondary px-4 py-3 text-center",
        className,
      )}
    >
      <span className="rainbow-accent w-1/4 max-w-12" aria-hidden />
      <BrandLogo
        logoUrl={logoUrl}
        alt=""
        className="aspect-[4/3] w-1/2 max-w-16 opacity-70"
      />
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}
