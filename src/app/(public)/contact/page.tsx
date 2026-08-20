import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | Chatter Snow",
};

export default function ContactPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-[var(--line)] pb-6">
          <p className="app-eyebrow">Contact us</p>
          <h1 className="brand-display mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Get in touch
          </h1>
          <p className="app-muted mt-2 text-sm">
            A contact form and our social links are on their way.
          </p>
        </header>

        <div className="mt-10">
          <p className="app-muted text-sm">This page is coming soon.</p>
        </div>
      </div>
    </main>
  );
}
