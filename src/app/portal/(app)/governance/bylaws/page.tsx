import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDocumentUrls } from "@/lib/storage/documents-sign";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { BylawsTable } from "./bylaws-table";
import type { Bylaws } from "./bylaws-actions";

const BYLAWS_SELECT =
  "id, version, effective_date, amendment_summary, external_link, document_path, body_text";

export const metadata: Metadata = {
  title: "Bylaws",
};

export default async function BylawsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const { data: bylaws } = await supabase
    .from("bylaws")
    .select(BYLAWS_SELECT)
    .order("effective_date", { ascending: false });

  // Signed on the reader's own client: the bucket decides who resolves one.
  const bylawsWithDocuments = await withDocumentUrls(
    supabase,
    (bylaws ?? []) as unknown as Bylaws[],
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Bylaws
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6">
        <BylawsTable bylaws={bylawsWithDocuments} canManage={canManage} />
      </div>
    </>
  );
}
