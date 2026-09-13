import type { Metadata } from "next";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = {
  title: "Confirm your notification address",
  // Nothing here is worth finding in a search result, and a URL carrying a
  // one-time token is worth actively keeping out of an index.
  robots: { index: false, follow: false },
};

/**
 * Where the link in a confirmation email lands (#1049).
 *
 * Public by necessity: the mailbox being claimed is frequently not the browser
 * the portal session lives in, and possession of the token is the proof being
 * asked for. See the Server Action for the rest of that reasoning.
 */
export default async function ConfirmNotificationEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="app-shell py-12">
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Confirm your address
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 max-w-xl">
        <ConfirmForm token={typeof token === "string" ? token : null} />
      </div>
    </div>
  );
}
