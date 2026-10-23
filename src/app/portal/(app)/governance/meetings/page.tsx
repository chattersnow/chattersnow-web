import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { TabsContent } from "@/components/ui/tabs";
import {
  GOVERNANCE_OPEN_WORK_KIND_LABELS,
  getGovernanceOpenWork,
} from "@/lib/portal/governance-open-work";
import { parseTaskFilters } from "@/lib/portal/task-list";
import { MeetingsTable } from "./meetings-table";
import { MeetingsViewTabs } from "./meetings-view-tabs";
import { NewMeetingDialog } from "./new-meeting-dialog";
import type { MeetingRow } from "./meeting-badges";
import { OpenWorkTable } from "../open-work/open-work-table";
import type { PersonListItem } from "../../people/actions";

export const metadata: Metadata = {
  title: "Meetings",
};

const ACTION_ITEM_KIND_LABELS = {
  action_item: GOVERNANCE_OPEN_WORK_KIND_LABELS.action_item,
};

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");
  // The Action items view is Open work's query restricted to one kind
  // (#1659), so its filters and inline actions are Open work's too.
  const filters = {
    ...parseTaskFilters(await searchParams, []),
    type: "action_item",
  };

  const [{ data: meetings }, actionItems, { data: people }] = await Promise.all(
    [
      supabase
        .from("governance_meetings")
        .select(
          "id, meeting_date, meeting_type, status, location, notes, facilitator:people!governance_meetings_facilitator_person_id_fkey(id, name, preferred_name, email, phone), notetaker:people!governance_meetings_notetaker_person_id_fkey(id, name, preferred_name, email, phone), event_id, event:events!governance_meetings_event_id_fkey(id, name, starts_at)",
        )
        .order("meeting_date", { ascending: false }),
      getGovernanceOpenWork(supabase, filters, { canEdit: canManage }),
      supabase
        .from("people")
        .select(
          "id, name, preferred_name, email, phone, auth_user_id, has_portal_access",
        )
        .order("name", { ascending: true }),
    ],
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Meetings
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <MeetingsViewTabs>
        <TabsContent value="meetings" className="mt-6 space-y-4">
          <MeetingsTable
            meetings={(meetings ?? []) as unknown as MeetingRow[]}
            newAction={canManage ? <NewMeetingDialog /> : null}
          />
        </TabsContent>
        <TabsContent value="action-items" className="mt-6">
          <OpenWorkTable
            rows={actionItems.rows}
            filters={filters}
            owners={actionItems.owners}
            today={actionItems.today}
            people={(people ?? []) as PersonListItem[]}
            kindLabels={ACTION_ITEM_KIND_LABELS}
            emptyMessage="No action items match these filters."
          />
        </TabsContent>
      </MeetingsViewTabs>
    </>
  );
}
