import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
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

  // PageShell rather than a bare div, like every other public page: it is what
  // centers the content in the same container the header and footer use, and
  // what renders the <main id="main-content"> the layout's skip link targets.
  // Deliberately the default max-w-6xl so this page's left edge lines up with
  // the header and footer; the short copy below is held to a readable measure
  // by its own max-w-xl, the same split privacy/layout.tsx describes.
  return (
    <PageShell>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
          Confirm your address
        </h1>
      </div>

      <div className="mt-6 max-w-xl">
        <ConfirmForm token={typeof token === "string" ? token : null} />
      </div>
    </PageShell>
  );
}
