import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { ResolutionsTable } from "./resolutions-table";
import { NewResolutionDialog } from "./new-resolution-dialog";
import type { Resolution } from "./resolutions-actions";
import type { ResolutionMeetingOption } from "./resolutions-shared";
import type { PersonListItem } from "../../people/actions";

const RESOLUTION_SELECT =
  "id, meeting_id, motion_text, vote_outcome, effective_date, external_link, body_text, mover:people!mover_person_id(id, name, preferred_name, email, phone), seconder:people!seconder_person_id(id, name, preferred_name, email, phone)";

export const metadata: Metadata = {
  title: "Resolutions",
};

export default async function ResolutionsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [{ data: resolutions }, { data: people }, { data: meetings }] =
    await Promise.all([
      supabase
        .from("resolutions")
        .select(RESOLUTION_SELECT)
        .order("created_at", { ascending: false }),
      supabase
        .from("people")
        .select(
          "id, name, preferred_name, email, phone, is_sponsor, auth_user_id",
        )
        .order("name", { ascending: true }),
      supabase
        .from("governance_meetings")
        .select("id, meeting_date, meeting_type")
        .order("meeting_date", { ascending: false }),
    ]);

  const peopleOptions = (people ?? []) as PersonListItem[];
  const meetingOptions = (meetings ?? []) as ResolutionMeetingOption[];

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Resolutions
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6">
        <ResolutionsTable
          resolutions={(resolutions ?? []) as unknown as Resolution[]}
          people={peopleOptions}
          meetings={meetingOptions}
          canManage={canManage}
          newAction={
            canManage ? (
              <NewResolutionDialog
                people={peopleOptions}
                meetings={meetingOptions}
              />
            ) : undefined
          }
        />
      </div>
    </>
  );
}
