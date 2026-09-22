// Who is looking at a public form, where that changes what the form offers
// (#1165, #1257, #1357).
//
// Two states rather than one nullable value, because a signed-in account with
// no approved claim (#1162) is not the same reader as a visitor with no
// cookie: the application is already holding its name and address, so asking
// it to type them again invites the typo that mints a second `people` row.
// Both still submit down the anonymous path -- only one of them starts from a
// blank form.
//
// Null stays "a visitor we know nothing about": no session, and nothing on
// screen differs from what they see today.
//
// The line every consumer has to hold (§5.23): what is shown may vary with
// what the *session* knows about itself, never with whether a typed address
// matches a directory record -- a form that behaved differently would answer
// "do you have a record of this person?" for anybody who can make an account.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MyContactDetails } from "@/lib/constituent/contact";

/**
 * What a session knows about itself, and nothing more (#1257).
 *
 * Every field here comes off `auth.users`: the address the account verified,
 * and whatever display name the identity provider handed over. That is what
 * makes it safe to put on a public page.
 */
export type ConstituentSessionAccount = {
  /** The verified address on the account. */
  email: string | null;
  /** A display name from the provider's metadata, where there is one. */
  name: string | null;
};

export type ConstituentViewer =
  | {
      kind: "linked";
      /** What the organization already has for them, to prefill with. */
      person: MyContactDetails;
      /** The session itself, which is what a "signed in as" line may name. */
      account: ConstituentSessionAccount;
    }
  | {
      kind: "account";
      /** The session's own fields, with no reference to the directory. */
      account: ConstituentSessionAccount;
    };

/** The metadata keys OAuth providers use for a human-readable name. */
const ACCOUNT_NAME_KEYS = ["full_name", "name", "preferred_name"] as const;

export function accountName(metadata: Record<string, unknown> | undefined) {
  for (const key of ACCOUNT_NAME_KEYS) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * The signed-in view of whoever is on a public page.
 *
 * The session is checked first so that a page serving a visitor with no cookie
 * makes no further calls: `my_contact_details()` is granted to `authenticated`
 * alone, so for anybody else it is a round trip that can only come back empty.
 *
 * No record is an account whose claim (#1162) has not been approved, or a
 * tenant with the constituent area off. There is no `people` row to attach
 * anything to, so the anonymous path -- which will match or mint one -- is
 * still the right offer; it just arrives filled in from the account.
 */
export async function loadConstituentViewer(
  supabase: SupabaseClient,
): Promise<ConstituentViewer | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const account: ConstituentSessionAccount = {
    email: user.email ?? null,
    name: accountName(user.user_metadata),
  };

  const { data } = await supabase.rpc("my_contact_details");
  const person = ((data ?? []) as MyContactDetails[])[0];
  if (!person) return { kind: "account", account };

  return { kind: "linked", person, account };
}

/** What to prefill a public form's contact fields with, for any viewer. */
export type ViewerContactPrefill = {
  name: string;
  email: string;
  phone: string;
  instagramHandle: string;
  /**
   * The address of the session filling the fields in, for the one line that
   * says so. Always the session's own, never the directory's: on a shared
   * browser it is what tells somebody the form is not about them.
   */
  signedInAs: string | null;
};

export const EMPTY_CONTACT_PREFILL: ViewerContactPrefill = {
  name: "",
  email: "",
  phone: "",
  instagramHandle: "",
  signedInAs: null,
};

/**
 * The prefill for one viewer, decided in one place so that the two sources --
 * a linked person's record, and a session's own fields -- cannot drift apart
 * between the forms that use them.
 */
export function contactPrefill(
  viewer: ConstituentViewer | null,
): ViewerContactPrefill {
  if (!viewer) return EMPTY_CONTACT_PREFILL;
  if (viewer.kind === "account") {
    return {
      ...EMPTY_CONTACT_PREFILL,
      name: viewer.account.name ?? "",
      email: viewer.account.email ?? "",
      signedInAs: viewer.account.email,
    };
  }
  const { person } = viewer;
  return {
    name: person.preferred_name ?? person.name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    instagramHandle: person.instagram_handle ?? "",
    signedInAs: viewer.account.email,
  };
}
