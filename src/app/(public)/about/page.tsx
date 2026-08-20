import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us | Chatter Snow",
};

export default function AboutPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-[var(--line)] pb-6">
          <p className="app-eyebrow">About us</p>
          <h1 className="brand-display mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Our mission
          </h1>
          <p className="app-muted mt-2 text-sm">
            Chatter Snow&apos;s story, mission, and programs are on their way.
          </p>
        </header>

        <div className="mt-10">
          <p className="app-muted text-sm">
            This page is coming soon. In the meantime, meet the people behind
            Chatter Snow on the{" "}
            <Link href="/about/team" className="text-[var(--purple)] underline underline-offset-4">
              team page
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
