import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDocumentUrls } from "@/lib/storage/documents-sign";
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
  "id, meeting_id, motion_text, vote_outcome, effective_date, external_link, document_path, body_text, mover:people!resolutions_mover_person_id_fkey(id, name, preferred_name, email, phone), seconder:people!resolutions_seconder_person_id_fkey(id, name, preferred_name, email, phone)";

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
          "id, name, preferred_name, email, phone, auth_user_id, has_portal_access",
        )
        .order("name", { ascending: true }),
      supabase
        .from("governance_meetings")
        .select("id, meeting_date, meeting_type")
        .order("meeting_date", { ascending: false }),
    ]);

  const peopleOptions = (people ?? []) as PersonListItem[];
  const meetingOptions = (meetings ?? []) as ResolutionMeetingOption[];

  // Signed on the reader's own client: the bucket decides who resolves one.
  const resolutionsWithDocuments = await withDocumentUrls(
    supabase,
    (resolutions ?? []) as unknown as Resolution[],
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Resolutions
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6">
        <ResolutionsTable
          resolutions={resolutionsWithDocuments}
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
