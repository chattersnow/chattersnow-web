"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkAnyPermission,
  type PermissionCheck,
} from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  documentFileName,
  type DocumentKind,
  type DocumentModule,
} from "@/lib/storage/documents";

export type DocumentPathResult = { error: string } | { path: string };

/**
 * Who may upload into each module's folder: the grant its insert policy
 * checks. Receipts (#1490) take either kind of spend's manage grant.
 */
const UPLOAD_PERMISSIONS: Record<DocumentModule, readonly PermissionCheck[]> = {
  governance: [{ resource: "governance", level: "manage" }],
  receipts: [
    { resource: "event_expenses", level: "manage" },
    { resource: "reimbursements", level: "manage" },
  ],
};

/**
 * Where the next document goes: `{tenant_id}/{module}/{uuid}/{file name}`
 * (#1489).
 *
 * The bucket's policies in 20260930120000 are what enforce the prefix, the
 * module's manage grant and the demo refusal. This exists, like
 * `createGearPhotoPathAction`, to refuse before a phone spends seconds
 * re-encoding and uploading, and to say why in words: no organization picked
 * yet, or the demo, where uploads are off.
 */
export async function createDocumentPathAction(
  module: DocumentModule,
  fileName: string,
  kind: DocumentKind,
): Promise<DocumentPathResult> {
  const supabase = await createSupabaseServerClient();

  const userResult = await checkUser(
    supabase,
    "You must be signed in to upload a document.",
  );
  if ("error" in userResult) return userResult;

  // A Server Action's argument is whatever the caller sent.
  if (!Object.hasOwn(UPLOAD_PERMISSIONS, module)) {
    return { error: "Documents can't be uploaded here." };
  }
  const permissionError = await checkAnyPermission(
    supabase,
    UPLOAD_PERMISSIONS[module],
  );
  if (permissionError) return permissionError;

  const { data: tenantId, error } = await supabase.rpc("current_tenant_id");
  if (error || !tenantId) {
    return { error: "Choose an organization before uploading a document." };
  }

  const { data: isDemo } = await supabase.rpc("current_tenant_is_demo");
  if (isDemo) {
    return {
      error: "Uploads are turned off in the demo. Paste a link instead.",
    };
  }

  return {
    path: `${tenantId}/${module}/${crypto.randomUUID()}/${documentFileName(fileName, kind)}`,
  };
}
