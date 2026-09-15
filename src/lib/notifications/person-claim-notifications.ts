import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantMailContext } from "@/lib/email/identity";
import { deliverEmail } from "@/lib/notifications/deliver";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  renderClaimDecisionEmail,
  renderClaimReviewEmail,
} from "@/lib/notifications/person-claim-emails";
import { notifyRoleHolders } from "@/lib/notifications/submission-notifications";

/** The kind a reviewer can switch off on their own /portal/account page. */
export const PERSON_CLAIM_KIND = "person_claim";

/** Who owns the queue. The same permission the page and the RPC require. */
export const PERSON_CLAIM_RESOURCES = ["constituent_claims"];

/**
 * Tell the reviewers a claim is waiting (#1162).
 *
 * Called from `after()` in the Server Action, so nothing here may throw and
 * nothing here may matter to the claimant: their claim is committed and their
 * page has already said "thanks".
 */
export async function notifyNewPersonClaim(
  admin: SupabaseClient,
  options: { claimId: string; siteUrl: string },
) {
  const { data: claim, error } = await admin
    .from("person_claims")
    .select("id, tenant_id, stated_name, stated_email, stated_instagram_handle")
    .eq("id", options.claimId)
    .maybeSingle();

  if (error || !claim) {
    if (error) {
      console.error("[claim-notify] could not read the claim", error);
    }
    return;
  }

  // The count only, never the candidates. The reviewer opens the queue to see
  // who; an email that named a donor would put that name in an inbox, and in
  // whatever else touches it on the way.
  const { data: candidates } = await admin.rpc("person_claim_candidates", {
    p_claim_id: claim.id,
  });

  await notifyRoleHolders(admin, {
    tenantId: claim.tenant_id,
    kind: PERSON_CLAIM_KIND,
    resourceKeys: PERSON_CLAIM_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${PERSON_CLAIM_KIND}:${claim.id}`,
    fallbackOrigin: options.siteUrl,
    render: (origin) =>
      renderClaimReviewEmail(
        {
          statedName: claim.stated_name,
          statedEmail: claim.stated_email,
          statedInstagram: claim.stated_instagram_handle,
          candidateCount: (candidates ?? []).length,
        },
        origin,
      ),
  });
}

/**
 * Tell the claimant what was decided.
 *
 * The form promised they would hear either way, so both outcomes send. The two
 * halves take different paths, and the reason is structural rather than a
 * preference:
 *
 *   - **Approved.** They now have a `people` row, so the ledger row carries it
 *     and the send dedupes per person like every other one.
 *   - **Rejected.** They have none, and must not be given one: a refused claim
 *     has to leave nothing behind in the directory, which is why the
 *     claimant's details live on the claim rather than being written through.
 *     `notification_deliveries.person_id` has been nullable since
 *     20260907120000 -- "addressed to the organization" rather than to a
 *     record -- and a null dedupes on that migration's partial index. So a
 *     rejection is ledgered too, just without a person on it.
 *
 * Neither message says anything about what matched. See the renderer.
 */
export async function notifyPersonClaimDecision(
  admin: SupabaseClient,
  options: { claimId: string; siteUrl: string },
) {
  const { data: claim, error } = await admin
    .from("person_claims")
    .select("id, tenant_id, status, auth_user_id, claimed_person_id")
    .eq("id", options.claimId)
    .maybeSingle();

  if (error || !claim) {
    if (error) {
      console.error("[claim-notify] could not read the decided claim", error);
    }
    return;
  }
  if (claim.status !== "approved" && claim.status !== "rejected") return;
  if (!(await isOrgEmailEnabled(admin, claim.tenant_id))) return;

  // The account's own verified address, not anything typed into the form: this
  // is the one address we know belongs to whoever asked.
  const { data: account } = await admin.auth.admin.getUserById(
    claim.auth_user_id,
  );
  const to = account?.user?.email;
  if (!to) return;

  const mail = await tenantMailContext(admin, claim.tenant_id, {
    fallbackOrigin: options.siteUrl,
  });
  const approved = claim.status === "approved";
  const render = () =>
    renderClaimDecisionEmail(
      { approved, organizationName: mail.displayName },
      mail.origin,
    );

  await deliverEmail(admin, {
    tenantId: claim.tenant_id,
    personId: approved ? claim.claimed_person_id : null,
    kind: PERSON_CLAIM_KIND,
    dedupeKey: `${PERSON_CLAIM_KIND}:decision:${claim.id}`,
    to,
    identity: mail.identity,
    render,
    logPrefix: "[claim-notify]",
  });
}
