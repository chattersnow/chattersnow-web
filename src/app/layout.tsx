import type { Metadata } from "next";
import { Quicksand, Rock_Salt } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { PLATFORM_TITLE } from "@/lib/public-site";
import "./globals.css";

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
});

const rockSalt = Rock_Salt({
  variable: "--font-rock-salt",
  weight: "400",
  subsets: ["latin"],
});

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
      className={`${quicksand.variable} ${rockSalt.variable} h-full antialiased`}
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
