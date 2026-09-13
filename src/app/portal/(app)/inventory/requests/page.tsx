import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import {
  GEAR_REQUEST_STATUSES,
  parseGearRequestSettings,
} from "@/lib/gear-requests";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/portal/empty-state";
import { GearRequestsTable, type GearRequestListRow } from "./requests-table";
import { GearRequestSettingsPanel } from "./request-settings-panel";

type RequestsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** `open` is the default: everything staff still have to act on. */
const STATUS_FILTERS = [
  { value: "open", label: "Open" },
  ...GEAR_REQUEST_STATUSES,
  { value: "all", label: "All" },
] as const;

const OPEN_STATUSES = ["new", "quoted", "paid"];

// The section is named in the tenant's own words (#896), so the page is too.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: `${(await getTenantLexicon(supabase)).collection} requests` };
}

export default async function GearRequestsPage({
  searchParams,
}: RequestsPageProps) {
  const supabase = await createSupabaseServerClient();
  const [lexicon, permissions, params] = await Promise.all([
    getTenantLexicon(supabase),
    getCurrentUserPermissions(supabase),
    searchParams,
  ]);
  const canManage = hasPermission(permissions, "inventory", "manage");

  const rawStatus = params.status;
  const statusParam = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  const statusFilter = STATUS_FILTERS.some(
    (option) => option.value === statusParam,
  )
    ? (statusParam as string)
    : "open";

  let query = supabase
    .from("gear_requests")
    .select(
      "id, status, delivery_method, quoted_amount, created_at, requester:people(id, name, preferred_name, email), items:inventory_movements(inventory_item:inventory_items(description))",
    )
    .order("created_at", { ascending: false });
  if (statusFilter === "open") query = query.in("status", OPEN_STATUSES);
  else if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const [{ data: rows, error }, settingsResult] = await Promise.all([
    query,
    canManage
      ? supabase.rpc("get_gear_request_settings")
      : Promise.resolve(null),
  ]);

  const requests = (rows ?? []) as unknown as GearRequestListRow[];
  const filterLabel =
    STATUS_FILTERS.find((option) => option.value === statusFilter)?.label ??
    statusFilter;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {lexicon.collection} requests
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        What visitors have asked for from the public{" "}
        {lexicon.collection_public.toLowerCase()}, how they want it delivered,
        and where the postage conversation stands for anything being shipped.
      </p>

      <form
        method="get"
        className="rainbow-surface mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md"
      >
        <div className="flex min-w-40 flex-col gap-1">
          <label htmlFor="requests-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="requests-status"
            name="status"
            defaultValue={statusFilter}
            className={selectClassName}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
      </form>

      <div className="mt-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load requests. Please try again.
            </AlertDescription>
          </Alert>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="px-0">
              <EmptyState
                title={
                  statusFilter === "open"
                    ? "No open requests"
                    : `No ${filterLabel.toLowerCase()} requests`
                }
                description={
                  statusFilter === "open"
                    ? `Requests appear here as soon as someone asks for items from the public ${lexicon.collection_public.toLowerCase()}.`
                    : "Try a different status filter."
                }
              />
            </CardContent>
          </Card>
        ) : (
          <GearRequestsTable rows={requests} />
        )}
      </div>

      {canManage && settingsResult && !settingsResult.error ? (
        <div className="mt-8">
          <GearRequestSettingsPanel
            settings={parseGearRequestSettings(settingsResult.data)}
            collectionLabel={lexicon.collection}
          />
        </div>
      ) : null}
    </>
  );
}
