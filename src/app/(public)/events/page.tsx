import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Events | Chatter Snow",
};

export default function EventsPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-[var(--line)] pb-6">
          <p className="app-eyebrow">Events</p>
          <h1 className="brand-display mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Upcoming &amp; past events
          </h1>
          <p className="app-muted mt-2 text-sm">
            Event listings and details are on their way.
          </p>
        </header>

        <div className="mt-10">
          <p className="app-muted text-sm">This page is coming soon.</p>
        </div>
      </div>
    </main>
  );
}
