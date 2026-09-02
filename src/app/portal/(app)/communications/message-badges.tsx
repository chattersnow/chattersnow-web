import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ContactMessageStatus } from "./message-types";

// Mirrors CONTACT_TOPICS in src/app/(public)/contact/contact-form.tsx -- the
// public form's values are the only source of truth for topic keys.
export const CONTACT_TOPIC_LABELS: Record<string, string> = {
  general: "General inquiry",
  partnership: "Partnerships & sponsorship",
  volunteer: "Volunteering",
  gear: "Gear",
};

const STATUS_STYLES: Record<ContactMessageStatus, string> = {
  new: "bg-primary/10 text-primary",
  read: "bg-muted text-muted-foreground",
  resolved: "bg-secondary text-secondary-foreground",
};

function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ContactMessageStatusBadge({
  status,
}: {
  status: ContactMessageStatus;
}) {
  return (
    <Pill className={STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}>
      {status}
    </Pill>
  );
}
