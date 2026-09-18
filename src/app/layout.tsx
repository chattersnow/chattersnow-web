import type { Metadata } from "next";
import {
  Caveat,
  Figtree,
  Fraunces,
  Inter,
  Nunito_Sans,
  Quicksand,
  Rock_Salt,
  Source_Serif_4,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { PLATFORM_TITLE } from "@/lib/public-site";
import "./globals.css";

/**
 * Every family any typography set uses (#1260).
 *
 * `next/font/google` is a compile-time transform over literal arguments, so
 * this list -- not the database -- is what the platform can offer. The sets
 * that pair them are `TYPOGRAPHY_SETS` in `src/lib/branding.ts`, and
 * `typography-registry.test.ts` fails if a set names a variable this file does
 * not declare.
 *
 * `preload: false` on all of them, and it is the point rather than an
 * oversight. `next/font` preloads with `<link rel="preload">` by default, and
 * a font called from the root layout is preloaded on *every* route -- so
 * declaring eight families the obvious way would have every visitor to every
 * tenant fetch eight typefaces to render two. There is no way to preload
 * selectively either: the loader gives back a class name and no URL, and the
 * root layout cannot know which tenant it is serving.
 *
 * What the `.variable` classes below cost is a custom property each. The font
 * *files* are only fetched when something resolves to one, which is what
 * `--brand-font-*` decides, so a visitor downloads their tenant's families and
 * no others. Discovery moves from the preload scanner to CSS parse -- a few
 * milliseconds later, covered by `display: swap`, which next/font sets by
 * default.
 */
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  preload: false,
});

const rockSalt = Rock_Salt({
  variable: "--font-rock-salt",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  preload: false,
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  preload: false,
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  preload: false,
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  preload: false,
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  preload: false,
});

const fontVariables = [
  quicksand,
  rockSalt,
  inter,
  sourceSerif,
  fraunces,
  nunitoSans,
  figtree,
  caveat,
]
  .map((font) => font.variable)
  .join(" ");

// The fallback only: the public layout and the portal layout each replace this
// with the organization the request is for (#707 Phase 4), so what is left
// here is what unmatched paths get -- the built-in 404 among them.
//
// Which is why it names no organization (#795 Phase 4). A host pointed at this
// deployment before its tenant row exists resolves to nobody, and every one of
// its pages 404s; titling those after whichever organization the defaults
// happen to name is the leak the 404 exists to close.
export const metadata: Metadata = {
  title: PLATFORM_TITLE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
