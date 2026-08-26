import type { Metadata } from "next";
import Link from "next/link";
import { SkiSizingSections } from "./ski-sizing-sections";
import { SnowboardSizingSections } from "./snowboard-sizing-sections";

export const metadata: Metadata = {
  title: "Sizing Guide | Chatter Snow",
};

const SKI_CATEGORIES = [
  { href: "#skis", label: "Skis" },
  { href: "#ski-boots", label: "Ski boots" },
  { href: "#ski-bindings", label: "Ski bindings" },
];

const SNOWBOARD_CATEGORIES = [
  { href: "#snowboards", label: "Snowboards" },
  { href: "#snowboard-boots", label: "Snowboard boots" },
  { href: "#snowboard-bindings", label: "Snowboard bindings" },
];

export default function GearSizingPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Sizing guide
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Not sure what size to look for in the{" "}
            <Link
              href="/gears/library"
              className="underline underline-offset-4 hover:text-foreground"
            >
              gear library
            </Link>
            ? These charts use standard, widely published industry sizing
            guidelines to help you find a good starting point for skis,
            snowboards, boots, and bindings.
          </p>

          <nav
            aria-label="Sizing categories"
            className="mt-6 flex flex-col gap-4 sm:flex-row sm:gap-10"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <span className="app-eyebrow">Ski</span>
              {SKI_CATEGORIES.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <span className="app-eyebrow">Snowboard</span>
              {SNOWBOARD_CATEGORIES.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </section>

        <div className="space-y-12">
          <SkiSizingSections />
          <SnowboardSizingSections />
        </div>
      </div>
    </main>
  );
}
