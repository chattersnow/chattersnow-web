import type { Metadata } from "next";
import { Quicksand, Rock_Salt } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_SITE_NAME } from "@/lib/public-site";
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

// The fallback only: the public layout and the portal layout each replace
// this with the organization the request is for (#707 Phase 4).
export const metadata: Metadata = {
  title: DEFAULT_SITE_NAME,
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
