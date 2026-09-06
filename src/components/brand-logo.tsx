import Image from "next/image";
import { cn } from "@/lib/utils";

/** The mark globals.css and the public assets ship with: Chatter Snow's. */
export const DEFAULT_LOGO = "/chatter-logo-transparent.png";

/**
 * The organization's logo: the tenant's own when branding sets one, else the
 * default mark. The default is a known bitmap with a known aspect ratio; a
 * tenant's logo is whatever they uploaded, so it renders `fill` inside a box
 * the caller sizes, the same way `SiteImage` does.
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
    <Image
      src={DEFAULT_LOGO}
      alt={alt}
      width={643}
      height={492}
      className={cn("w-auto", className)}
      style={{ width: "auto" }}
      priority={priority}
    />
  );
}
