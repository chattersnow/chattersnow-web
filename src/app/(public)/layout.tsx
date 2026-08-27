import Image from "next/image";
import Link from "next/link";
import { SiteNav } from "./site-nav";

const FOOTER_LINKS = [
  { label: "Events", href: "/events" },
  { label: "Programs", href: "/programs" },
  { label: "Gear", href: "/gears" },
  { label: "Get Involved", href: "/get-involved" },
  { label: "Support", href: "/support" },
  { label: "Contact", href: "/contact" },
] as const;

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-[var(--line)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/home" className="flex shrink-0 items-center gap-2">
            <Image
              src="/chatter-logo-transparent.png"
              alt="Chatter Snow"
              width={643}
              height={492}
              className="h-10 w-auto"
              style={{ width: "auto" }}
              priority
            />
            <span className="brand-display text-lg font-semibold tracking-[-0.02em] sm:text-xl">
              Chatter Snow
            </span>
          </Link>
          <SiteNav />
        </div>
      </header>
      {children}
      <footer className="mt-16 border-t border-[var(--line)] px-6 py-10 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="app-muted text-sm hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="app-muted flex flex-col gap-1 text-sm sm:text-right">
            <a
              href="mailto:info@chattersnow.org"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              info@chattersnow.org
            </a>
            <a
              href="https://www.instagram.com/chattersnow"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              @chattersnow
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
