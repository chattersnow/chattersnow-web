import type { Metadata } from "next";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
          <div className="rainbow-accent w-16" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
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
            snowboards, boots, and bindings. New to snow sports altogether?
            Start with{" "}
            <Link
              href="/learn"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Learn
            </Link>
            .
          </p>
        </section>

        <Tabs defaultValue="ski">
          <TabsList>
            <TabsTrigger value="ski">Ski</TabsTrigger>
            <TabsTrigger value="snowboard">Snowboard</TabsTrigger>
          </TabsList>

          <TabsContent value="ski" className="space-y-12 pt-8">
            <nav
              aria-label="Ski sizing categories"
              className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
            >
              {SKI_CATEGORIES.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <SkiSizingSections />
          </TabsContent>

          <TabsContent value="snowboard" className="space-y-12 pt-8">
            <nav
              aria-label="Snowboard sizing categories"
              className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
            >
              {SNOWBOARD_CATEGORIES.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <SnowboardSizingSections />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
