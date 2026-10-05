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
import { AskAllAsIsDialog } from "./ask-all-as-is-dialog";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  oneAsIsRequest,
  type AsIsRequestCandidate,
  type AsIsRequestStatus,
} from "@/lib/gear-request-as-is-requests";

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

type RawAsIsRequest = AsIsRequestStatus | AsIsRequestStatus[] | null;
type RawListRow = Omit<GearRequestListRow, "as_is_request"> & {
  as_is_request: RawAsIsRequest;
};

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
      "id, status, delivery_method, quoted_amount, created_at, as_is_acknowledged_at, as_is_method, as_is_request:gear_request_acknowledgement_requests(requested_at, acknowledged_at), requester:people(id, name, preferred_name, email), items:inventory_movements(inventory_item:inventory_items(description))",
    )
    .order("created_at", { ascending: false });
  if (statusFilter === "open") query = query.in("status", OPEN_STATUSES);
  else if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const [{ data: rows, error }, settingsResult, asIsCandidates, orgEmail] =
    await Promise.all([
      query,
      canManage
        ? supabase.rpc("get_gear_request_settings")
        : Promise.resolve(null),
      // Every request still missing its as-is acknowledgement, whatever the
      // filter shows, for the bulk ask (#1518).
      canManage
        ? supabase
            .from("gear_requests")
            .select(
              "id, status, person_id, as_is_acknowledged_at, requester:people(name, preferred_name, email), as_is_request:gear_request_acknowledgement_requests(requested_at, acknowledged_at)",
            )
            .is("as_is_acknowledged_at", null)
            .neq("status", "cancelled")
            .order("created_at", { ascending: true })
        : Promise.resolve(null),
      canManage ? getOrgEmailEnabled(supabase) : false,
    ]);

  const requests = ((rows ?? []) as unknown as RawListRow[]).map(
    (row): GearRequestListRow => ({
      ...row,
      as_is_request: oneAsIsRequest(row.as_is_request),
    }),
  );
  const candidates = (
    (asIsCandidates?.data ?? []) as unknown as (Omit<
      AsIsRequestCandidate,
      "as_is_request"
    > & { as_is_request: RawAsIsRequest })[]
  ).map((row): AsIsRequestCandidate => ({
    ...row,
    as_is_request: oneAsIsRequest(row.as_is_request),
  }));
  const filterLabel =
    STATUS_FILTERS.find((option) => option.value === statusFilter)?.label ??
    statusFilter;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
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

      {canManage && candidates.length > 0 ? (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="app-muted text-sm">
            {candidates.length === 1
              ? "1 request has no as-is acknowledgement on record."
              : `${candidates.length} requests have no as-is acknowledgement on record.`}
          </p>
          <AskAllAsIsDialog
            candidates={candidates}
            disabledReason={
              orgEmail
                ? undefined
                : "Outbound email is switched off for this organization."
            }
          />
        </div>
      ) : null}

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
