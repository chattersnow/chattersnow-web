/**
 * What a tenant's site actually collects, as the legal documents describe it
 * (#1291).
 *
 * `platformLegalDocument()` used to publish, as fact, that every site running
 * this application takes volunteer applications, event registrations, rider
 * profiles, gear requests, artwork submissions and contact messages. A tenant
 * running a contact form and nothing else published all six under its own name,
 * hedged by one sentence saying some of the forms above may not exist. That is
 * an honest dodge rather than an accurate policy, and the privacy policy is the
 * one document #859 keeps served for every tenant whatever else it has adopted.
 *
 * The signal was already computed: the switch the board set
 * (`page_visibility.*`) and the module entitlement the platform sold
 * (`public_tenant_modules`), both of which the public layout reads on every
 * request anyway.
 *
 * This is a named record rather than the raw visibility map so the prose beside
 * it reads as prose: `org.surfaces.volunteerApplications`, not
 * `visibility["get-involved-volunteer"]`.
 *
 * It takes no dependency on `@/lib/page-visibility`, which reaches `cache()`,
 * `next/navigation` and the server Supabase client -- `site-content.ts` types a
 * field against `CollectionSurface` and is imported by client components. The
 * cost is that the slot and module behind each surface are named here rather
 * than read from `PUBLIC_PAGE_SLOTS`; `legal-surface.test.ts` holds the two
 * lists together.
 */
export type CollectionSurface = {
  contact: boolean;
  volunteerApplications: boolean;
  eventRegistrations: boolean;
  /** Covers rider profiles too: the profile is part of the registration form. */
  gearRequests: boolean;
  artworkSubmissions: boolean;
  /**
   * Whether this tenant offers accounts on its *public* site (#1160, #1161).
   *
   * Everything under `/my`: signing up with an email address and a password,
   * claiming a directory record, correcting your own contact details,
   * choosing which emails you get. The policy's account bullet used to say
   * "for the people who run the organization", which stopped being true the
   * day a visitor could create one.
   */
  constituentAccounts: boolean;
  /**
   * Whether a constituent can log their own volunteer hours (#1165).
   *
   * Separate from `volunteerApplications` because the gates genuinely differ:
   * the application form is the public volunteer *page*, so hiding that slot
   * takes it away, while `log_my_volunteer_hours()` and its two pickers check
   * only the Volunteers module. A tenant that hides the public page and keeps
   * the module still collects self-logged hours, and the policy has to say so.
   */
  volunteerHours: boolean;
  /**
   * Whether the portal offers "Continue with Google", which is the only reason
   * Google appears in the subprocessor list.
   *
   * Always true today: `src/app/portal/login/login-form.tsx` renders the button
   * unconditionally, so there is no per-tenant switch to read and claiming
   * otherwise would break rule 1 in `legal-defaults.ts` -- only what the
   * software does. It is a field rather than a hard-coded bullet so that the
   * day the button becomes configurable, the policy follows it from here.
   */
  googleSignIn: boolean;
};

/**
 * The page-visibility slot and module behind each collected-from surface, as
 * `PUBLIC_PAGE_SLOTS` maps them. A null slot means the surface has no public
 * page to hide, and its module answers alone: `(public)/artwork/[code]` is
 * reached by the code on an open call rather than from the nav, `/my` is gated
 * by its module in `requireConstituentArea()` and again on every RPC, and
 * self-logged hours are gated by the Volunteers module inside the RPC.
 */
export const SURFACE_GATES: Readonly<
  Record<string, { slot: string | null; module: string }>
> = {
  contact: { slot: "contact", module: "communications" },
  volunteerApplications: {
    slot: "get-involved-volunteer",
    module: "volunteers",
  },
  eventRegistrations: { slot: "events", module: "events" },
  gearRequests: { slot: "gears", module: "inventory" },
  artworkSubmissions: { slot: null, module: "artwork" },
  constituentAccounts: { slot: null, module: "constituent_accounts" },
  volunteerHours: { slot: null, module: "volunteers" },
};

/**
 * Fails **open**, matching `moduleEnabled()` and `module_enabled_for_tenant()`:
 * a key missing from either map -- an unreadable read, a tenant that predates a
 * module row -- leaves the bullet in the policy. Over-describing what you
 * collect is a survivable error; under-describing it is the one this exists to
 * prevent.
 *
 * Both inputs are consulted, even though `getPageVisibility()` has already
 * folded the module into its answer. Its portal counterpart
 * `getTenantPageVisibility()` has not -- it reads `app_settings` directly --
 * and the starter document in the Site Content editor is built from that one.
 *
 * `constituent_accounts` is the one module in the catalog seeded
 * `default_enabled = false`, so a tenant that has said nothing reads an
 * explicit `false` here rather than falling through to open. Only a failed read
 * reaches the open branch for it, which is the same trade as everywhere else.
 */
function live(
  surface: keyof typeof SURFACE_GATES,
  visibility: Record<string, boolean>,
  modules: Record<string, boolean>,
): boolean {
  const { slot, module } = SURFACE_GATES[surface];
  if (modules[module] === false) return false;
  return slot === null || visibility[slot] !== false;
}

export function collectionSurface(
  visibility: Record<string, boolean>,
  modules: Record<string, boolean>,
): CollectionSurface {
  return {
    contact: live("contact", visibility, modules),
    volunteerApplications: live("volunteerApplications", visibility, modules),
    eventRegistrations: live("eventRegistrations", visibility, modules),
    gearRequests: live("gearRequests", visibility, modules),
    artworkSubmissions: live("artworkSubmissions", visibility, modules),
    constituentAccounts: live("constituentAccounts", visibility, modules),
    volunteerHours: live("volunteerHours", visibility, modules),
    googleSignIn: true,
  };
}

/**
 * The surfaces that are on, sorted -- one definition of "what this tenant
 * collects", small enough to store and compare.
 *
 * Nothing in #1291 reads it; #1292 records it at publish time as the
 * fingerprint a tenant's own document was written against, so it can say when
 * the configuration has moved on from the text.
 */
export function surfaceKeys(surface: CollectionSurface): string[] {
  return Object.keys(surface)
    .filter((key) => surface[key as keyof CollectionSurface])
    .sort();
}
