import { cn } from "@/lib/utils";

// Hand-rolled rather than imported: lucide-react dropped every brand icon in
// v1, so there is no `Instagram` export any more. The geometry below is the
// icon lucide used to ship, kept so this sits in the same stroked 24px grid as
// the rest of the icons on the site instead of reading as a solid brand badge.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}`;
}

/**
 * The one place the Instagram handle is rendered. The footer and the contact
 * page each used to spell out their own anchor, so the URL and the handle
 * lived in two files that had to be changed together. The handle itself is
 * site content (`org.instagram_handle`, #707 Phase 4); a tenant with none
 * renders nothing.
 *
 * The icon is aria-hidden and the anchor carries an explicit label, so the
 * link announces as Instagram rather than as a bare handle.
 */
export function InstagramLink({
  handle,
  orgName,
  className,
}: {
  handle: string;
  orgName: string;
  className?: string;
}) {
  if (!handle) return null;
  return (
    <a
      href={instagramUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${orgName} on Instagram (@${handle})`}
      className={cn(
        "group inline-flex items-center gap-2 hover:text-foreground",
        className,
      )}
    >
      <InstagramIcon className="size-4 shrink-0" />
      <span className="underline-offset-4 group-hover:underline">
        @{handle}
      </span>
    </a>
  );
}
