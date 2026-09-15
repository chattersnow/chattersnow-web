"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClaimCandidate = {
  person_id: string;
  tier: "email" | "instagram" | "name";
  score: number;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  instagram_handle: string | null;
  already_linked: boolean;
};

export type ReviewResult = { error: string } | { success: true };

/**
 * The records a claim might belong to, ranked.
 *
 * Read here rather than in the page's own query because the ranking is the
 * database's: `person_claim_candidates()` is `security definer` and gated on
 * `constituent_claims:view`, so the reviewer sees candidates without holding
 * read access to every column the matcher looked at.
 */
export async function claimCandidatesAction(
  claimId: string,
): Promise<ClaimCandidate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("person_claim_candidates", {
    p_claim_id: claimId,
  });
  if (error) return [];
  return (data ?? []) as ClaimCandidate[];
}

/**
 * Approve or reject one claim.
 *
 * The RPC's messages are deliberately passed through rather than replaced with
 * a house phrase: "That record is already linked to a different account" is
 * the one thing a reviewer needs to read, and it is a statement about the
 * organization's own records to a person already entitled to see them. That is
 * the opposite of the claimant-facing side, where every branch has to look the
 * same.
 */
export async function reviewClaimAction(input: {
  claimId: string;
  approve: boolean;
  personId?: string | null;
  note?: string | null;
}): Promise<ReviewResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_person_claim", {
    p_claim_id: input.claimId,
    p_approve: input.approve,
    p_person_id: input.personId ?? undefined,
    p_review_note: input.note?.trim() || undefined,
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/people/claims");
  revalidatePath("/portal/people");
  return { success: true };
}
