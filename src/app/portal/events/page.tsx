import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogoutButton } from "../logout-button";
import { PortalTabs } from "../portal-tabs";
import { NewEventDialog } from "./new-event-dialog";
import { StatusBadge, VisibilityBadge } from "./event-badges";

const SORTABLE_COLUMNS = ["name", "starts_at", "status", "visibility", "location"] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

const STATUS_VALUES = ["draft", "published"] as const;
const VISIBILITY_VALUES = ["public", "private"] as const;
const WHEN_VALUES = ["upcoming", "past"] as const;

type EventsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "name", label: "Event" },
  { key: "starts_at", label: "Starts" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
  { key: "visibility", label: "Visibility" },
];

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "starts_at";
  const dir: "asc" | "desc" = raw("dir") === "desc" ? "desc" : "asc";

  const statusRaw = raw("status");
  const statusFilter = STATUS_VALUES.includes(statusRaw as (typeof STATUS_VALUES)[number])
    ? (statusRaw as (typeof STATUS_VALUES)[number])
    : "all";

  const visibilityRaw = raw("visibility");
  const visibilityFilter = VISIBILITY_VALUES.includes(
    visibilityRaw as (typeof VISIBILITY_VALUES)[number]
  )
    ? (visibilityRaw as (typeof VISIBILITY_VALUES)[number])
    : "all";

  const whenRaw = raw("when");
  const whenFilter = WHEN_VALUES.includes(whenRaw as (typeof WHEN_VALUES)[number])
    ? (whenRaw as (typeof WHEN_VALUES)[number])
    : "all";

  const nowIso = new Date().toISOString();

  let query = supabase
    .from("events")
    .select("id, name, location, starts_at, ends_at, timezone, visibility, status")
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (visibilityFilter !== "all") {
    query = query.eq("visibility", visibilityFilter);
  }
  if (whenFilter === "upcoming") {
    query = query.gte("starts_at", nowIso);
  } else if (whenFilter === "past") {
    query = query.lt("starts_at", nowIso);
  }

  const { data: events, error } = await query;

  const filterParams = new URLSearchParams();
  if (statusFilter !== "all") filterParams.set("status", statusFilter);
  if (visibilityFilter !== "all") filterParams.set("visibility", visibilityFilter);
  if (whenFilter !== "all") filterParams.set("when", whenFilter);

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    const sp = new URLSearchParams(filterParams);
    sp.set("sort", column);
    sp.set("dir", nextDir);
    return `/portal/events?${sp.toString()}`;
  }

  function SortIcon({ column }: { column: SortColumn }) {
    if (sort !== column) {
      return <ArrowUpDown className="size-3.5 text-muted-foreground" />;
    }
    return dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
  }

  const hasActiveFilters = statusFilter !== "all" || visibilityFilter !== "all" || whenFilter !== "all";

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/chatter-logo-transparent.png"
              alt="Chatter Snow"
              width={150}
              height={200}
              className="h-14 w-auto shrink-0 sm:h-16"
              style={{ width: "auto" }}
              priority
            />
            <div className="min-w-0">
              <Link
                href="/portal/home"
                className="app-muted text-xs font-semibold uppercase tracking-[0.16em] hover:text-foreground"
              >
                Operations portal
              </Link>
              <h1 className="brand-display whitespace-nowrap text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Events
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LogoutButton />
          </div>
        </header>

        <PortalTabs />

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <NewEventDialog />

          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />

            <div className="flex flex-col gap-1">
              <label htmlFor="when" className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
                When
              </label>
              <select id="when" name="when" defaultValue={whenFilter} className={selectClassName}>
                <option value="all">All events</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="status" className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
                Status
              </label>
              <select id="status" name="status" defaultValue={statusFilter} className={selectClassName}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="visibility" className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
                Visibility
              </label>
              <select
                id="visibility"
                name="visibility"
                defaultValue={visibilityFilter}
                className={selectClassName}
              >
                <option value="all">All</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>

            <Button type="submit" variant="outline">
              Filter
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" render={<Link href="/portal/events" />}>
                Clear
              </Button>
            )}
          </form>
        </div>

        <Card className="mt-6">
          <CardContent className="px-0">
            {error ? (
              <p className="app-muted px-4 py-6 text-sm">Could not load events. Please try again.</p>
            ) : !events || events.length === 0 ? (
              <p className="app-muted px-4 py-6 text-sm">No events match these filters.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableHead key={column.key}>
                        <Link
                          href={sortHref(column.key)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {column.label}
                          <SortIcon column={column.key} />
                        </Link>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.name}</TableCell>
                      <TableCell>{dateFormatter.format(new Date(event.starts_at))}</TableCell>
                      <TableCell className="app-muted">{event.location || "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={event.status} />
                      </TableCell>
                      <TableCell>
                        <VisibilityBadge visibility={event.visibility} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
