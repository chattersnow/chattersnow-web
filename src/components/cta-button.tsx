import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * A button whose destination is *content* rather than a route written into the
 * page (#1327).
 *
 * The site's own buttons are `<Button render={<Link/>}>`, and that is still
 * what this renders for a path on this site -- the home hero's markup is
 * unchanged by the move to a content-authored list. A destination a tenant
 * typed may be somewhere else entirely, though, and `next/link` is for
 * in-app navigation, so an absolute URL gets a plain anchor with the
 * `noopener` pair `target="_blank"` requires.
 *
 * `isPublishableHref()` has already decided which of the two this is: a
 * leading `/` is the only internal form it accepts, and it rejects `//host`
 * precisely so a protocol-relative URL cannot be mistaken for one here.
 */
export function CtaButton({
  href,
  variant = "secondary",
  children,
}: {
  href: string;
  variant?: "rainbow" | "secondary";
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={variant}
      nativeButton={false}
      render={
        href.startsWith("/") ? (
          <Link href={href} />
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer" />
        )
      }
    >
      {children}
    </Button>
  );
}
