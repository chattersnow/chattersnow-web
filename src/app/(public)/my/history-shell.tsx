import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The shell the four history sections share (#1163).
 *
 * Deliberately not the portal's `HistoryCard`: that one is built around a
 * staff reader who wants counts in the title and an empty state explaining
 * where the data would come from. Here a section that has nothing in it is not
 * rendered at all, so there is no empty state to design, and the count belongs
 * where it means something to the person -- hours volunteered, money given --
 * rather than as "(3)" after every heading.
 *
 * Mobile first, because this is opened on a phone from an email link far more
 * often than at a desk: one column at every width, entries stacked rather than
 * tabulated, and nothing that needs a horizontal scroll to read.
 */
export function MySection({
  title,
  summary,
  children,
}: {
  title: string;
  /** The one number this section is about, where it has one. */
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="brand-display text-lg font-semibold">
          {title}
        </CardTitle>
        {summary && <p className="app-muted text-sm">{summary}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  );
}

/**
 * One labelled group inside a section -- "Coming up", "Requests", "Received".
 *
 * Renders nothing when it is empty, which is what lets a section carry several
 * groups without a person who has only ever done one of them seeing the
 * others.
 */
export function MyGroup({
  title,
  isEmpty,
  children,
}: {
  title: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  if (isEmpty) return null;
  return (
    <div>
      <h3 className="app-muted mb-2 text-xs font-semibold uppercase tracking-[0.1em]">
        {title}
      </h3>
      <ul className="flex flex-col gap-3 text-sm">{children}</ul>
    </div>
  );
}

/**
 * One record: what it was, when, and at most one badge saying where it stands.
 *
 * `secondary` wraps rather than truncating. A gear description and an event
 * name are both written by people who had no idea how wide the reader's screen
 * would be.
 */
export function MyEntry({
  primary,
  secondary,
  status,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  /** A `MyStatus`, where the record has somewhere to be. */
  status?: ReactNode;
}) {
  return (
    <li className="border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-medium">{primary}</p>
        {status}
      </div>
      {secondary && (
        <p className="app-muted mt-1 leading-relaxed">{secondary}</p>
      )}
    </li>
  );
}

/**
 * Where a record stands, in the one word the person cares about.
 *
 * `tone` is the only decision a caller makes: `done` for something that
 * happened, `open` for something still in motion, `closed` for something that
 * will not. Nothing here spells out a staff workflow state -- a requester needs
 * to know their request is waiting, not which queue it is in.
 */
export function MyStatus({
  children,
  tone = "open",
}: {
  children: ReactNode;
  tone?: "done" | "open" | "closed";
}) {
  const variant =
    tone === "done" ? "success" : tone === "closed" ? "muted" : "secondary";
  return (
    <Badge variant={variant} className="shrink-0">
      {children}
    </Badge>
  );
}
