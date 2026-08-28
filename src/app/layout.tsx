import type { Metadata } from "next";
import { Quicksand, Rock_Salt } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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

export const metadata: Metadata = {
  title: "Chatter Snow",
  description:
    "Chatter Snow is a queer ski and snowboard community bringing LGBTQ+ skiers and snowboarders together on and off the East Coast mountains.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${quicksand.variable} ${rockSalt.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
