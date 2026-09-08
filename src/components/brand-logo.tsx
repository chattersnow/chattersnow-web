import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The organization's logo: the tenant's own when branding sets one, else a
 * placeholder mark.
 *
 * The placeholder used to be `/chatter-logo-transparent.png` -- one
 * organization's actual logo, shipped as every organization's default, so a
 * tenant that had uploaded nothing wore somebody else's mark (#795 Phase 3).
 * Chatter Snow now sets that file as its own `brand.logo_url`, which is why it
 * stays in `public/`; nothing else points at it.
 *
 * What replaces it is drawn rather than fetched, in the palette's own tokens,
 * so it costs no request, cannot 404, and looks unset rather than borrowed. A
 * tenant's logo is whatever they uploaded, so it renders `fill` inside a box
 * the caller sizes, the same way `SiteImage` does; the placeholder fills the
 * same box, so swapping one for the other moves no layout.
 */
export function BrandLogo({
  logoUrl,
  alt,
  className,
  priority,
}: {
  logoUrl: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  if (logoUrl) {
    return (
      <span className={cn("relative block", className)}>
        <Image
          src={logoUrl}
          alt={alt}
          fill
          sizes="10rem"
          priority={priority}
          className="object-contain"
        />
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("block", className)}
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7"
        fill="var(--purple-soft)"
        stroke="var(--line)"
      />
      <circle cx="16" cy="16" r="6.5" fill="var(--purple)" />
    </svg>
  );
}
