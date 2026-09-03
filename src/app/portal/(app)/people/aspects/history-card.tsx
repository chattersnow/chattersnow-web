import { EmptyState } from "@/components/portal/empty-state";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The shell every history card shares. Before the registry, the person detail
 * page repeated this Card/CardHeader/EmptyState markup inline five times.
 *
 * `count` is optional rather than assumed: two of the cards ("Volunteer
 * activity", "Partnerships") aggregate several result sets and have never
 * shown a count, and their titles are the locator e2e uses to find them.
 */
export function HistoryCard({
  title,
  count,
  titleSuffix,
  isEmpty,
  emptyTitle,
  emptyDescription,
  actions,
  children,
}: {
  title: string;
  /** Renders " (n)" after the title. Omit for cards that aggregate. */
  count?: number;
  /** Appended after the count, e.g. " · Attended 2". */
  titleSuffix?: React.ReactNode;
  /** Defaults to `count === 0`; pass it when several sets decide emptiness. */
  isEmpty?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  /** Per-aspect actions, gated by the caller. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const empty = isEmpty ?? count === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
          {count !== undefined && ` (${count})`}
          {titleSuffix}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState
            className="py-4"
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          children
        )}
      </CardContent>
      {actions && <CardFooter className="gap-2">{actions}</CardFooter>}
    </Card>
  );
}

/** The flat list used by the single-set cards. */
export function HistoryList({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col gap-3 text-sm">{children}</ul>;
}

export function HistoryItem({
  primary,
  secondary,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <li className="border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
      <p className="font-medium">{primary}</p>
      {secondary && <p className="app-muted">{secondary}</p>}
    </li>
  );
}

/** Wraps the labelled sub-lists of an aggregating card. */
export function HistoryGroups({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 text-sm">{children}</div>;
}

/**
 * One labelled sub-list, e.g. "Applications" inside Volunteer activity.
 * Renders nothing when it has no entries, matching the previous inline
 * `rows.length > 0 && (...)` guards.
 */
export function HistorySection({
  title,
  isEmpty,
  children,
}: {
  title: React.ReactNode;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  if (isEmpty) return null;
  return (
    <div>
      <p className="app-muted mb-1 text-xs font-semibold uppercase tracking-[0.1em]">
        {title}
      </p>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}
