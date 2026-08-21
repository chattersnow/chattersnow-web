import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Volunteer | Chatter Snow",
};

export default function VolunteerPage() {
  return (
    <div>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Volunteer opportunities
      </h1>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        This page is coming soon.
      </p>
    </div>
  );
}
