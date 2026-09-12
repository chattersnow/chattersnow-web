import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { InstagramLink } from "@/components/instagram-link";
import { buttonVariants } from "@/components/ui/button";
import { isPublishableHref } from "@/lib/legal-markup";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Links") };
}

/**
 * Styled as a button, but an anchor rather than one.
 *
 * `<Button render={<Link/>}>` is how the rest of the site does this, and it is
 * wrong here: Base UI stamps `role="button"` on what it renders, so every row
 * on a page that is nothing but navigation would announce to a screen reader
 * as a button. `buttonVariants` gives the same appearance and leaves the
 * element a link.
 */
const LINK_BUTTON = buttonVariants({
  variant: "secondary",
  className:
    "h-auto min-h-12 w-full flex-col items-center gap-0.5 py-3 text-center whitespace-normal",
});

type LinkItem = {
  label: string;
  url: string;
  description?: string;
  /** Absent on a row written before the field existed, which reads as shown. */
  published?: boolean;
};

/**
 * Whether a configured row may be put on the page.
 *
 * The editor already refuses an unpublishable destination, so this is the
 * second of two checks rather than the only one -- but `site_content` is a
 * table an operator can write to directly, and the whole output of this page
 * is `href`s. A row that would otherwise render `javascript:` is dropped here
 * rather than trusted because the editor would have caught it.
 */
function isLive(item: LinkItem): boolean {
  return (
    item.published !== false &&
    Boolean(item.label?.trim()) &&
    typeof item.url === "string" &&
    isPublishableHref(item.url)
  );
}

export default async function LinksPage() {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  const { name, branding, content } = site;

  const intro = content.text("links.intro");
  const links = content.list<LinkItem>("links.items").filter(isLive);

  return (
    <>
      <BrandLogo
        logoUrl={branding.logoUrl}
        alt={name ?? ""}
        className="h-20 w-20"
        priority
      />
      {name && (
        <h1 className="brand-display mt-4 text-center text-2xl font-semibold tracking-[-0.02em]">
          {name}
        </h1>
      )}
      <p className="app-muted mt-2 text-center text-sm">
        {content.text("org.tagline")}
      </p>

      <h2 className="app-eyebrow mt-8">{content.text("links.heading")}</h2>
      {intro && <p className="mt-2 text-center text-sm">{intro}</p>}

      {/* No empty state to write: an organization that has published no links
          gets its name, its mark and its tagline, which is a coherent page --
          an error message on the only thing a social profile points at would
          not be. */}
      {links.length > 0 && (
        <nav aria-label={content.text("links.heading")} className="mt-6 w-full">
          <ul className="flex w-full flex-col gap-3">
            {links.map((item, index) => (
              <li key={`${item.url}-${index}`}>
                <LinkTarget href={item.url} className={LINK_BUTTON}>
                  <span className="font-semibold">{item.label}</span>
                  {item.description && (
                    <span className="app-muted text-xs font-normal">
                      {item.description}
                    </span>
                  )}
                </LinkTarget>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="app-muted mt-10 flex flex-col items-center gap-2 text-sm">
        <InstagramLink
          handle={content.text("org.instagram_handle")}
          orgName={name ?? "this organization"}
        />
        <Link href="/home" className="underline-offset-4 hover:underline">
          Visit our website
        </Link>
      </div>
    </>
  );
}

/**
 * `next/link` for a page on this site, a plain anchor for everywhere else.
 * `isPublishableHref` has already decided which this is -- a leading `/` is
 * the only internal form it accepts, and `//host` is rejected precisely so it
 * cannot be mistaken for one here.
 */
function LinkTarget({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
