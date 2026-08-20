import Link from "next/link";
import { PublicTabs } from "./public-tabs";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-[var(--line)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link
            href="/home"
            className="brand-display text-lg font-semibold tracking-[-0.02em] text-[var(--purple-deep)]"
          >
            Chatter Snow
          </Link>
          <PublicTabs />
        </div>
      </header>
      {children}
    </>
  );
}
