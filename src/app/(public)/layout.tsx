import Image from "next/image";
import Link from "next/link";
import { SiteNav } from "./site-nav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-[var(--line)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/home" className="shrink-0">
            <Image
              src="/chatter-logo-transparent.png"
              alt="Chatter Snow"
              width={150}
              height={200}
              className="h-10 w-auto"
              style={{ width: "auto" }}
              priority
            />
          </Link>
          <SiteNav />
        </div>
      </header>
      {children}
    </>
  );
}
