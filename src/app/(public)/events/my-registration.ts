import { createSupabaseServerClient } from "@/lib/supabase/server";
import { constituentAreaEnabled } from "@/lib/constituent/guard";
import type { MyContactDetails } from "@/lib/constituent/contact";
import type { AccountOffer } from "@/components/registration-account-offer";

/** The caller's own registration for one event, from `my_event_registration()`. */
export type MyEventRegistration = {
  registration_id: string;
  party_size: number;
  notes: string | null;
  registered_at: string;
  checked_in_at: string | null;
};

/**
 * What a session knows about itself, and nothing more (#1257).
 *
 * Every field here comes off `auth.users`: the address the account verified,
 * and whatever display name the identity provider handed over. That is what
 * makes it safe to put on a public page -- it answers "who are you signed in
 * as?", never "do we have a record of you?", which is the question §5.23's
 * silence rule refuses for anybody who can make an account.
 */
export type EventViewerAccount = {
  /** The verified address on the account. */
  email: string | null;
  /** A display name from the provider's metadata, where there is one. */
  name: string | null;
};

/**
 * Who is looking at this event, where that changes what it offers (#1165,
 * #1257).
 *
 * Two states rather than one nullable value, because a signed-in account with
 * no approved claim (#1162) is not the same reader as a visitor with no
 * cookie: the application is already holding its name and address, so asking
 * it to type them again invites the typo that mints a second `people` row.
 * Both still register down the anonymous path -- only one of them starts from
 * a blank form.
 *
 * Null stays "a visitor we know nothing about": no session, and nothing on
 * screen differs from what they see today.
 */
export type EventViewer =
  | {
      kind: "linked";
      /** What the organization already has for them, to prefill with. */
      person: MyContactDetails;
      /** Their registration, if they already have one. */
      registration: MyEventRegistration | null;
    }
  | {
      kind: "account";
      /** The session's own fields, with no reference to the directory. */
      account: EventViewerAccount;
    };

/** The metadata keys OAuth providers use for a human-readable name. */
const ACCOUNT_NAME_KEYS = ["full_name", "name", "preferred_name"] as const;

function accountName(metadata: Record<string, unknown> | undefined) {
  for (const key of ACCOUNT_NAME_KEYS) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Loads the signed-in view of one event.
 *
 * The session is checked first so that a public page serving a visitor with no
 * cookie makes no further calls: both RPCs below are granted to
 * `authenticated` alone, so for anybody else they are a round trip that can
 * only come back empty.
 */
export async function loadEventViewer(
  eventId: string,
): Promise<EventViewer | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [details, registration] = await Promise.all([
    supabase.rpc("my_contact_details"),
    supabase.rpc("my_event_registration", { p_event_id: eventId }),
  ]);

  const person = ((details.data ?? []) as MyContactDetails[])[0];
  // No record is an account whose claim (#1162) has not been approved, or a
  // tenant with the constituent area off. There is no `people` row to attach a
  // registration to, so the anonymous form -- which will match or mint one --
  // is still the right offer; it just arrives filled in from the account.
  if (!person) {
    return {
      kind: "account",
      account: {
        email: user.email ?? null,
        name: accountName(user.user_metadata),
      },
    };
  }

  return {
    kind: "linked",
    person,
    registration:
      ((registration.data ?? []) as MyEventRegistration[])[0] ?? null,
  };
}

/**
 * What to offer a registrant once their registration is saved (#1258).
 *
 * Decided on the server and null on a tenant without the constituent area,
 * rather than rendered and hidden: there is no `/my` to send anyone to there,
 * `requireConstituentArea()` answers that route with `notFound()`, and the RPC
 * behind the offer refuses as well. The demo tenant is covered by the same
 * gate, permanently and by decision (#1177).
 *
 * The three states are the three readers. A visitor with no session is offered
 * an account; an account with no record linked yet is offered the claim, with
 * nothing to retype; somebody already linked is offered nothing, because it is
 * already on their record -- and in practice never reaches here, since a linked
 * reader registers down `register_myself_for_event()` instead.
 *
 * Nothing in it varies with whether the registration matched a directory
 * record, which is the point: an offer that did would answer "do you have a
 * record of this person?" for anybody who can make an account (§5.23).
 *
 * The module read costs no query: `getPublicTenantModules` is `cache()`d on a
 * request-scoped client, and the public layout has already issued it.
 */
export async function loadRegistrationAccountOffer(
  viewer: EventViewer | null,
): Promise<AccountOffer | null> {
  if (viewer?.kind === "linked") return null;
  if (!(await constituentAreaEnabled())) return null;
  return viewer ? "claim" : "sign-up";
}
