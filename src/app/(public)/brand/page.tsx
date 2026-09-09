import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { InstagramLink } from "@/components/instagram-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { SiteImage } from "@/components/site-image";
import { accentStops, brandColorPairs } from "@/lib/branding";
import { requireVisiblePage } from "@/lib/page-visibility";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getSiteImageUrls } from "@/lib/site-images";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Brand") };
}

type VoicePair = { do: string; dont: string };
type Rule = { text: string };

const JUMP_LINKS = [
  { href: "#color", label: "Color" },
  { href: "#type", label: "Typography" },
  { href: "#space", label: "Spacing" },
  { href: "#logo", label: "Logo" },
  { href: "#voice", label: "Voice" },
  { href: "#imagery", label: "Imagery" },
  { href: "#in-use", label: "In use" },
  { href: "#templates", label: "Templates" },
];

/**
 * The spacing steps that actually recur in the site's layout, not the whole
 * 4px scale. Tailwind's default grid, so these are the platform's and the same
 * for every tenant -- there is no spacing token in `BRAND_COLOR_TOKENS` and
 * there should not be.
 */
const SPACING = [
  { name: "gap-2", rem: 0.5 },
  { name: "gap-4", rem: 1 },
  { name: "px-6 / gap-6", rem: 1.5 },
  { name: "gap-8", rem: 2 },
  { name: "px-10", rem: 2.5 },
  { name: "mt-16", rem: 4 },
];

/**
 * Rendered through the CSS variables rather than as pixel numbers. globals.css
 * derives every step from one `--radius`, so quoting "7px" here would be a
 * second source for a value that has one -- and would be silently wrong the
 * day `--radius` moves.
 */
const RADIUS = [
  { name: "sm", cssVar: "--radius-sm", factor: "0.6 x" },
  { name: "md", cssVar: "--radius-md", factor: "0.8 x" },
  { name: "lg", cssVar: "--radius-lg", factor: "1 x" },
  { name: "xl", cssVar: "--radius-xl", factor: "1.4 x" },
  { name: "2xl", cssVar: "--radius-2xl", factor: "1.8 x" },
  { name: "3xl", cssVar: "--radius-3xl", factor: "2.2 x" },
];

/**
 * Rules that belong to the components rather than to an organization. A tenant
 * adds its own in `brand.logo_rules`; these hold whoever the tenant is, because
 * they are properties of how the gradient and the surfaces are built.
 */
const SYSTEM_RULES = [
  "The accent gradient is a bar, a border wash or a button fill. Never a full-bleed background behind body text -- contrast is unreliable across it.",
  "The page background is never pure white. Cards sit on it, not the other way round.",
  "The gradient runs left to right at 90 degrees. Rotating it breaks the pairing with every strip already on the site.",
];

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-[var(--line)] pt-10"
    >
      <p className="app-eyebrow">{eyebrow}</p>
      <h2 className="brand-display mt-2 text-2xl font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      {intro && (
        <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed">
          {intro}
        </p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default async function BrandPage() {
  // Off by default, and for a different reason from every other hidden slot:
  // see the `brand` entry in PUBLIC_PAGE_SLOTS.
  await requireVisiblePage("brand");

  const supabase = await createSupabaseServerClient();
  const [{ name, branding, content }, siteImages] = await Promise.all([
    getPublicSite(supabase),
    getSiteImageUrls(supabase),
  ]);

  const colors = brandColorPairs(branding);
  const stops = accentStops(branding);
  const voice = content.list<VoicePair>("brand.voice");
  const logoRules = content.list<Rule>("brand.logo_rules");
  const tagline = content.text("org.tagline");
  const shortName = content.text("org.short_name");
  const contactEmail = content.text("org.email_general");
  /**
   * The photos the organization has actually published, as the approved set.
   *
   * There is no separate "brand imagery" store and there should not be: a
   * second library would drift from the site the day someone swapped a photo,
   * and a partner would be handed a picture no longer in use. These are the
   * `site_content` image slots, which is to say the pictures already standing
   * on the public site under this organization's name.
   */
  const approvedImagery = Object.values(siteImages)
    .filter((url): url is string => Boolean(url))
    .slice(0, 6);
  const templatePhoto = approvedImagery[0] ?? null;

  /**
   * The literal hex behind two tokens, for the parts of this page that depict
   * a *fixed artifact* -- a social post, a logo on a dark ground -- rather than
   * a piece of the site.
   *
   * They must not be `var(--purple-deep)`. That token inverts in dark mode by
   * design, so a template painted with it turned pale under a dark theme while
   * its headline stayed white: white on lavender, unreadable. Nothing in the
   * types or the unit tests sees that; it showed up the first time the page was
   * opened in a browser with the theme toggled. A post exported to Instagram
   * has no dark mode, so it is pinned to the colour it will actually be.
   */
  const hex = (key: string) =>
    colors.find((pair) => pair.token.key === key)!.value;
  const deepHex = hex("primary_deep");
  const softHex = hex("primary_soft");

  return (
    <PageShell maxWidth="max-w-4xl">
      <div className="space-y-10">
        <header>
          <div className="rainbow-accent" />
          <p className="app-eyebrow mt-4">{shortName}</p>
          <h1 className="brand-display mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("brand.heading")}
          </h1>
          <p className="app-muted mt-4 max-w-2xl text-sm leading-relaxed sm:text-base">
            {content.text("brand.intro")}
          </p>
          {/* The claim the old hand-built guide could not make. Every value
              below is read at request time from the same rows that paint the
              site, so there is no version of this page that disagrees with it. */}
          <p className="app-muted mt-4 max-w-2xl text-xs leading-relaxed">
            Read from the live site when this page loaded. If a colour changes,
            this page changes with it.
          </p>
        </header>

        <nav
          aria-label="Sections"
          className="flex flex-wrap gap-x-4 gap-y-2 border-y border-[var(--line)] py-3"
        >
          {JUMP_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="app-muted text-sm hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Section
          id="color"
          eyebrow="01 — Color"
          title="Palette"
          intro="What each colour is for is a property of the design system, so it is the same wherever these colours are used. The values are this organization's."
        >
          {/* Both modes on every swatch, each half labelled and carrying its
              own hex.

              This was a full-width light fill with the dark form as an
              unlabelled third of a stripe, and only on the two tokens that
              have one. It rendered correctly and communicated nothing: the
              first person to look at the page reported there were no dark
              colours on it. A value someone has to eyedropper off a screenshot
              is not documentation, and a half-swatch that is simply absent
              reads as an oversight rather than as "this one stays neutral". */}
          <div className="grid gap-4 sm:grid-cols-2">
            {colors.map(({ token, value, darkHex }) => (
              <div
                key={token.key}
                className="overflow-hidden rounded-xl border border-[var(--line)] bg-card"
              >
                <div className="flex h-20">
                  <div className="flex-1" style={{ background: value }} />
                  <div
                    className="flex-1"
                    style={{ background: darkHex ?? "var(--muted)" }}
                  />
                </div>
                <div className="p-4">
                  <p className="font-semibold">{token.label}</p>
                  <p className="app-muted mt-1 text-sm leading-relaxed">
                    {token.description}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="app-muted text-xs">Light</dt>
                      <dd className="font-mono uppercase">{value}</dd>
                    </div>
                    <div>
                      <dt className="app-muted text-xs">Dark</dt>
                      <dd
                        className={
                          darkHex ? "font-mono uppercase" : "app-muted text-xs"
                        }
                      >
                        {/* Said out loud rather than left blank. Dark mode
                            keeps the stylesheet's neutral surfaces for these
                            two by design -- see `brandingCss`. */}
                        {darkHex ?? "Neutral surface, not a brand colour"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            ))}
          </div>
          <p className="app-muted mt-4 text-sm leading-relaxed">
            The dark values are derived from each colour&apos;s own hue rather
            than mixed toward white, which is why they stay recognisably ours on
            a dark background.
          </p>

          <div className="mt-6 rounded-xl border border-[var(--line)] bg-card p-5">
            <p className="app-eyebrow">The accent gradient</p>
            <div
              className="mt-4 h-10 rounded-lg"
              style={{ background: "var(--rainbow)" }}
            />
            {/* However many stops the tenant set, up to MAX_ACCENT_STOPS. The
                old guide drew six because Chatter Snow has six. */}
            <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {stops.map((stop) => (
                <li key={`${stop.color}-${stop.position}`}>
                  <div
                    className="h-11 rounded-md border border-[var(--line)]"
                    style={{ background: stop.color }}
                  />
                  <p className="mt-1 font-mono text-xs uppercase">
                    {stop.color}
                  </p>
                  <p className="app-muted font-mono text-xs">
                    {stop.position}%
                  </p>
                </li>
              ))}
            </ul>
            <p className="app-muted mt-4 text-sm leading-relaxed">
              A 90-degree linear gradient, left to right, with{" "}
              {stops.length === 1 ? "one stop" : `${stops.length} stops`} at the
              positions above.
            </p>
          </div>
        </Section>

        <Section
          id="type"
          eyebrow="02 — Typography"
          title="The platform's type system"
          intro="Unlike the colours, the typeface is not yours to set: it is part of the software rather than of your brand, and it is the same on every organization's site. The words in the specimens are yours."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--line)] bg-card p-6">
              <div className="app-muted flex items-baseline justify-between text-xs">
                <span>Headline</span>
                <span className="font-mono">600 · -0.04em</span>
              </div>
              <p className="brand-display mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                {tagline}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-card p-6">
              <div className="app-muted flex items-baseline justify-between text-xs">
                <span>Eyebrow</span>
                <span className="font-mono">700 · 0.2em · uppercase</span>
              </div>
              <p className="app-eyebrow mt-3">{shortName}</p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-card p-6">
              <div className="app-muted flex items-baseline justify-between text-xs">
                <span>Body</span>
                <span className="font-mono">400–500 · 1.6</span>
              </div>
              <p className="mt-3 max-w-[58ch] text-sm leading-relaxed sm:text-base">
                {content.text("brand.intro")}
              </p>
            </div>
          </div>
          <p className="app-muted mt-4 text-sm leading-relaxed">
            If your organization needs its own typeface, that is a change to the
            software rather than a setting — ask, and it can be looked at.
          </p>
        </Section>

        <Section
          id="space"
          eyebrow="03 — Spacing & radius"
          title="The measurements"
          intro="Both scales belong to the design system. Spacing is a 4px grid; every corner radius is derived from a single value, so they stay in proportion when it moves."
        >
          <ul className="space-y-2">
            {SPACING.map((step) => (
              <li key={step.name} className="flex items-center gap-4">
                <span className="app-muted w-32 shrink-0 font-mono text-xs">
                  {step.name}
                </span>
                <span
                  className="h-3.5 rounded-sm bg-[var(--purple)]"
                  style={{ width: `${step.rem}rem` }}
                />
                <span className="app-muted font-mono text-xs">
                  {step.rem * 16}px
                </span>
              </li>
            ))}
          </ul>

          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {RADIUS.map((radius) => (
              <li key={radius.name}>
                <div
                  className="h-16 border border-[var(--line)] bg-[var(--purple-soft)]"
                  style={{ borderRadius: `var(${radius.cssVar})` }}
                />
                <p className="app-muted mt-1 text-center font-mono text-xs">
                  {radius.name} · {radius.factor}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="logo"
          eyebrow="04 — Logo"
          title="The mark"
          intro="Reproduce it from the file, at whatever size the layout needs, and leave it alone otherwise."
        >
          <div className="flex flex-wrap items-center gap-8">
            <div className="rounded-xl border border-[var(--line)] bg-card p-8">
              <BrandLogo
                logoUrl={branding.logoUrl}
                alt={name ?? ""}
                className="h-24 w-24"
              />
            </div>
            {/* The literal, for the same reason the templates use it: this
                tile exists to show the mark on the brand's dark ground, and
                `var(--purple-deep)` would turn it pale under a dark theme. */}
            <div
              className="rounded-xl border border-[var(--line)] p-8"
              style={{ background: deepHex }}
            >
              <BrandLogo
                logoUrl={branding.logoUrl}
                alt=""
                className="h-24 w-24"
              />
            </div>
          </div>

          {/* The file itself, not just a picture of it. Without this the
              section tells someone what the mark looks like and leaves them to
              right-click a next/image element, which hands them a resized
              WebP off the optimiser rather than the original. */}
          {branding.logoUrl && (
            <div className="mt-6">
              <Button
                variant="secondary"
                nativeButton={false}
                render={
                  <a
                    href={branding.logoUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                  />
                }
              >
                Download the logo
              </Button>
              {/* Stated rather than left to be discovered at the print shop.
                  The mark is raster; vector is tracked on #845. */}
              <p className="app-muted mt-2 text-xs">
                Raster only for now. If you need vector artwork for print, ask
                and we will send it.
              </p>
            </div>
          )}

          <ul className="app-muted mt-6 space-y-2 text-sm leading-relaxed">
            {logoRules.map((rule) => (
              <li key={rule.text}>{rule.text}</li>
            ))}
          </ul>
        </Section>

        <Section
          id="voice"
          eyebrow="05 — Voice"
          title="How we sound"
          intro="The part of a brand no colour can carry."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {voice.map((pair) => (
              <Card key={pair.do}>
                <CardHeader>
                  <CardTitle className="text-base">{pair.do}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="app-muted text-sm leading-relaxed">
                    Not: {pair.dont}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6">
            <p className="app-eyebrow">Our name in writing</p>
            <div className="mt-2 space-y-2">
              {content.paragraphs("brand.name_usage").map((paragraph) => (
                <p
                  key={paragraph}
                  className="app-muted max-w-3xl text-sm leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </Section>

        {/* Rendered even with nothing in it, rather than hidden when the
            tenant has published no photos. The sections are numbered, and a
            conditional one makes an organization with no imagery jump from 05
            to 07 -- a guide that looks like it is missing a page. The empty
            state also says something true and useful to a partner. */}
        <Section
          id="imagery"
          eyebrow="06 — Imagery"
          title="Approved photography"
          intro="The pictures currently published on our site. Using one of these is always safe; anything else should be checked with us first, because a photo of our community carries consent we have to be able to vouch for."
        >
          {approvedImagery.length > 0 ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {approvedImagery.map((url) => (
                <li key={url}>
                  <SiteImage
                    url={url}
                    alt=""
                    className="aspect-[4/3] rounded-xl"
                    sizes="(min-width: 640px) 15rem, 45vw"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="app-muted text-sm leading-relaxed">
              We have not published any photography yet. Ask us before using an
              image alongside our name.
            </p>
          )}
        </Section>

        <Section
          id="in-use"
          eyebrow="07 — In use"
          title="The real components"
          intro="Not screenshots. These are the same components the rest of the site is built from, rendered here in your colours, so they cannot fall out of date."
        >
          <div className="rounded-xl border border-[var(--line)] bg-card p-6">
            <div className="rainbow-strip" />
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="rainbow">Primary action</Button>
              <Button variant="secondary">Secondary action</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">A card</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="app-muted text-sm leading-relaxed">
                    Cards carry most of the site&apos;s content. They sit on the
                    page background, which is why that background is never pure
                    white.
                  </p>
                </CardContent>
              </Card>
              <div className="rounded-xl border border-[var(--line)] p-5">
                <div className="rainbow-accent" />
                <p className="app-eyebrow mt-4">Eyebrow</p>
                <p className="brand-display mt-1 text-xl font-semibold tracking-[-0.02em]">
                  A section heading
                </p>
              </div>
            </div>
          </div>

          <ul className="app-muted mt-6 space-y-2 text-sm leading-relaxed">
            {SYSTEM_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </Section>

        <Section
          id="templates"
          eyebrow="08 — Templates"
          title="Social layouts"
          intro="Two shapes that hold up at post and story sizes, built from the same tokens. Rebuild them in whatever tool you use; the measurements are above."
        >
          <div className="grid items-start gap-6 sm:grid-cols-[1fr_auto]">
            <div>
              <div
                className="relative aspect-square overflow-hidden rounded-2xl"
                style={{ background: deepHex }}
              >
                {templatePhoto && (
                  <SiteImage
                    url={templatePhoto}
                    alt=""
                    // SiteImage's own box is a rounded square; here it is the
                    // full bleed behind the scrim, and the rounding belongs to
                    // the frame around it.
                    className="absolute inset-0 h-full w-full rounded-none opacity-55"
                  />
                )}
                <div className="absolute inset-0 flex flex-col justify-end p-6">
                  <div className="rainbow-strip rounded-full" />
                  <p className="brand-display mt-4 text-2xl font-semibold tracking-[-0.02em] text-white">
                    {tagline}
                  </p>
                  <p className="mt-2 text-sm text-white/80">{shortName}</p>
                </div>
              </div>
              <p className="app-muted mt-2 text-xs">
                Square post — photo, scrim, accent strip, headline.
              </p>
            </div>

            {/* Width-capped rather than left to fill the column: a 9:16 box in
                half of a 4xl page is over 900px tall, which dwarfs the square
                beside it and makes the pair read as one big thing and one
                small one. */}
            <div className="w-full max-w-[15rem]">
              <div
                className="relative flex aspect-[9/16] flex-col justify-center overflow-hidden rounded-2xl p-7"
                style={{ background: softHex }}
              >
                <div className="rainbow-accent" />
                <p
                  className="app-eyebrow mt-4"
                  style={{ color: hex("primary") }}
                >
                  {shortName}
                </p>
                <p
                  className="brand-display mt-2 text-xl font-semibold tracking-[-0.02em]"
                  style={{ color: deepHex }}
                >
                  {tagline}
                </p>
              </div>
              <p className="app-muted mt-2 text-xs">
                Story — tint background, no photo, type doing the work.
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="questions"
          eyebrow="09 — Questions"
          title="Before you publish"
          intro="If you are producing something that carries our name and this page does not answer your question, ask rather than guess."
        >
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="secondary"
              nativeButton={false}
              render={<a href={`mailto:${contactEmail}`} />}
            >
              {contactEmail}
            </Button>
            {/* Through the shared component, not a hand-written anchor: the
                footer and the contact page each used to spell out their own
                and drifted. A tenant with no handle renders nothing. */}
            <InstagramLink
              handle={content.text("org.instagram_handle")}
              orgName={name ?? "this organization"}
            />
          </div>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed">
            Tagging us is the fastest way to have something checked before it
            goes out.
          </p>
        </Section>
      </div>
    </PageShell>
  );
}
