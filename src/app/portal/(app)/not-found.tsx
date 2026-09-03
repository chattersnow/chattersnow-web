import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Scoped to the portal shell so the eight detail routes that call notFound()
 * (stale bookmark, deleted record, mistyped id) land somewhere with the
 * sidebar and a route back, rather than on Next's unstyled default 404.
 */
export default function PortalNotFound() {
  return (
    <div className="max-w-2xl">
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Not found
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-4 text-sm leading-relaxed">
        We couldn&apos;t find that record. It may have been deleted, or the link
        might be out of date.
      </p>
      <Button
        nativeButton={false}
        render={<Link href="/portal/home" />}
        className="mt-6"
      >
        Back to dashboard
      </Button>
    </div>
  );
}
