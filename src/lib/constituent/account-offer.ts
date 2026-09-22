// What to offer a reader once a public write has saved what they told us
// (#1258, #1359).
//
// Written once here rather than per surface, because the decision is about
// the reader and not about the record: an event registration and a gear
// request are both the moment somebody has said who they are, and the answer
// to "may we keep it?" cannot be allowed to come out differently on the two
// pages. `loadRegistrationAccountOffer()` and the gear cart both delegate to
// this.
//
// It lives beside the guard rather than in `viewer.ts` because it reaches
// `next/headers` through the server Supabase client, and `viewer.ts` is
// value-imported by client components.
import { constituentAreaEnabled } from "@/lib/constituent/guard";

/** What the reader is offered once their record is saved (#1258). */
export type AccountOffer = "sign-up" | "claim";

/** The shape every viewer type in this area shares: linked, or not. */
type ViewerKind = { kind: "linked" | "account" } | null;

/**
 * The offer for one viewer, or null for nobody to offer anything to.
 *
 * Decided on the server and null on a tenant without the constituent area,
 * rather than rendered and hidden: there is no `/my` to send anyone to there,
 * `requireConstituentArea()` answers that route with `notFound()`, and the
 * RPCs behind the offer refuse as well. The demo tenant is covered by the same
 * gate, permanently and by decision (#1177).
 *
 * The three states are the three readers. A visitor with no session is offered
 * an account; an account with no record linked yet is offered the claim, with
 * nothing to retype; somebody already linked is offered nothing, because it is
 * already on their record -- and in practice never reaches here, since a linked
 * reader writes down the self-service RPC instead.
 *
 * Nothing in it varies with whether the record matched a directory row, which
 * is the point: an offer that did would answer "do you have a record of this
 * person?" for anybody who can make an account (§5.23).
 *
 * The module read costs no query: `getPublicTenantModules` is `cache()`d on a
 * request-scoped client, and the public layout has already issued it.
 */
export async function loadAccountOffer(
  viewer: ViewerKind,
): Promise<AccountOffer | null> {
  if (viewer?.kind === "linked") return null;
  if (!(await constituentAreaEnabled())) return null;
  return viewer ? "claim" : "sign-up";
}
