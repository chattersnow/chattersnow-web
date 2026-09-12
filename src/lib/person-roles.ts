import { DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";

/**
 * The words an organization uses for the six roles a person can hold (#911).
 *
 * Donor, sponsor, volunteer, attendee, staff and partner are nonprofit
 * vocabulary, written when Chatter Snow was the product. An organization that
 * sells things has customers; a studio has members and students; a shop has
 * clients and suppliers. Before this, none of those could be expressed and
 * "Donors" sat in the sidebar whether or not the tenant fundraised.
 *
 * **The keys stay platform-owned and the words become tenant data.** A role
 * here is not a row anybody can rename: `is_donor` is derived in
 * `person_role_flags()` from the donation tables, surfaced as a column on
 * `people_with_roles`, filtered on by a route, and asserted through
 * `person_role_tags` against a check constraint. Every one of those is written
 * against the key. So the key is what the schema, the routes and the tests
 * mean, and this registry holds only what a reader sees.
 *
 * Two words per role, not one: the plural is rarely the singular plus an "s"
 * once a tenant chooses it (Staff Member/Staff, Person/People), and the
 * surfaces genuinely need both -- "New Donor" on a button above a page titled
 * "Donors".
 *
 * The words render through the same `{term}` placeholder engine the lexicon
 * uses (`src/lib/lexicon.ts`), so a nav label, a segment title and an empty
 * state are templates resolved once against the tenant's vocabulary. They are
 * *stored* separately, under one `people.role_labels` map rather than a row per
 * word: twelve more `lexicon.%` rows would double the size of a panel whose own
 * registry says to resist growing, and these are a different kind of word --
 * the lexicon names what an organization lends, this names who it works with.
 *
 * What this deliberately does not rename: the `is_*` columns, the
 * `person_role_tags.role` values, the `/portal/people/donors` routes. A URL is not a
 * label, and renaming one per tenant buys nothing.
 */
export const PERSON_ROLE_KEYS = [
  "is_donor",
  "is_sponsor",
  "is_volunteer",
  "is_attendee",
  "is_staff",
  "is_partner",
] as const;

export type PersonRoleKey = (typeof PERSON_ROLE_KEYS)[number];

export type PersonRoleLabel = {
  singular: string;
  plural: string;
};

/** Every role, resolved: the tenant's words where it has them, ours otherwise. */
export type PersonRoleLabels = Record<PersonRoleKey, PersonRoleLabel>;

export type PersonRoleDefinition = {
  key: PersonRoleKey;
  /**
   * The placeholder stem this role's words answer to. `{donor}` is the
   * singular and `{donor_plural}` the plural, the same `<term>`/`<term>_plural`
   * pair the lexicon registry uses for an item.
   */
  term: string;
  /** What the admin panel calls this role while it is being renamed. */
  description: string;
  /** The platform's own words, used by every tenant that sets nothing. */
  default: PersonRoleLabel;
};

/**
 * In `PERSON_ASPECTS` order, which is the order the directory's Roles column,
 * the role facet and the person form all render in.
 *
 * The defaults are capitalised the way a button says them -- "New Staff
 * Member" -- because every other surface asks for `{term:lower}` where the word
 * sits mid-sentence. Getting that backwards means either the headings or the
 * prose is wrong for every tenant.
 */
export const PERSON_ROLES: readonly PersonRoleDefinition[] = [
  {
    key: "is_donor",
    term: "donor",
    description:
      "Someone who gives money or goods: Donor, Supporter, Contributor.",
    default: { singular: "Donor", plural: "Donors" },
  },
  {
    key: "is_sponsor",
    term: "sponsor",
    description:
      "An organization or person backing an event: Sponsor, Backer, Underwriter.",
    default: { singular: "Sponsor", plural: "Sponsors" },
  },
  {
    key: "is_volunteer",
    term: "volunteer",
    description: "Someone who gives time: Volunteer, Helper, Crew member.",
    default: { singular: "Volunteer", plural: "Volunteers" },
  },
  {
    key: "is_attendee",
    term: "attendee",
    description:
      "Someone who comes to what you run: Attendee, Guest, Student, Customer.",
    default: { singular: "Attendee", plural: "Attendees" },
  },
  {
    key: "is_staff",
    term: "staff",
    description:
      "Someone who works your events: Staff Member, Team Member, Instructor.",
    default: { singular: "Staff Member", plural: "Staff" },
  },
  {
    key: "is_partner",
    term: "partner",
    description:
      "An organization you work with: Partner, Client, Supplier, Affiliate.",
    default: { singular: "Partner", plural: "Partners" },
  },
] as const;

/** The single `app_settings` key the whole map is stored under. */
export const PERSON_ROLE_LABELS_SETTING_KEY = "people.role_labels";

/**
 * The longest a word may be, enforced by the admin action.
 *
 * The same 40 the lexicon allows, and for the same reason: these render in
 * navigation, where a sentence breaks the layout rather than the meaning.
 */
export const MAX_PERSON_ROLE_LABEL_LENGTH = 40;

/**
 * The form field one word is edited under, so the panel and the action agree on
 * a name without either of them spelling it out twice.
 */
export function personRoleLabelField(
  key: PersonRoleKey,
  form: keyof PersonRoleLabel,
): string {
  return `${key}.${form}`;
}

function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Only the words this tenant has actually set, unresolved, for the admin panel.
 *
 * The panel cannot use the resolved labels: a form pre-filled with twelve words
 * nobody chose gives an administrator no way to tell which are theirs. A blank
 * field means "the platform's word", the same contract branding and the lexicon
 * have.
 */
export function storedPersonRoleLabels(
  value: unknown,
): Partial<Record<PersonRoleKey, Partial<PersonRoleLabel>>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const map = value as Record<string, unknown>;
  const stored: Partial<Record<PersonRoleKey, Partial<PersonRoleLabel>>> = {};
  for (const role of PERSON_ROLES) {
    const entry = map[role.key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { singular, plural } = entry as Record<string, unknown>;
    const own: Partial<PersonRoleLabel> = {};
    if (trimmed(singular)) own.singular = trimmed(singular)!;
    if (trimmed(plural)) own.plural = trimmed(plural)!;
    if (Object.keys(own).length > 0) stored[role.key] = own;
  }
  return stored;
}

/**
 * Folds the tenant's stored map over the registry defaults.
 *
 * Per word rather than per role: an organization that renames only the plural
 * -- "Staff" to "Crew", leaving "Staff Member" alone -- keeps the platform's
 * singular rather than losing both. A blank string is a cleared field, not an
 * empty word, so it resolves to the default exactly as a missing key does.
 */
export function personRoleLabelsFromValue(value: unknown): PersonRoleLabels {
  const stored = storedPersonRoleLabels(value);
  const labels = {} as PersonRoleLabels;
  for (const role of PERSON_ROLES) {
    const own = stored[role.key];
    labels[role.key] = {
      singular: own?.singular ?? role.default.singular,
      plural: own?.plural ?? role.default.plural,
    };
  }
  return labels;
}

/** The labels with nothing set: the platform's own words. */
export const DEFAULT_PERSON_ROLE_LABELS: PersonRoleLabels =
  personRoleLabelsFromValue(null);

/**
 * The labels as placeholder terms, so `{donor}` and `{donor_plural}` resolve
 * through `applyLexicon` alongside `{collection}` and `{item_plural}`.
 */
export function personRoleTerms(
  labels: PersonRoleLabels,
): Record<string, string> {
  const terms: Record<string, string> = {};
  for (const role of PERSON_ROLES) {
    terms[role.term] = labels[role.key].singular;
    terms[`${role.term}_plural`] = labels[role.key].plural;
  }
  return terms;
}

const BY_KEY = new Map(PERSON_ROLES.map((role) => [role.key, role]));

/**
 * One role's word, for a surface naming a role directly rather than through a
 * template it holds -- the role facet, the person form's checkboxes, the Roles
 * column.
 *
 * Falls back to the platform's word for a vocabulary that does not carry the
 * term, which is what a subtree with no provider above it hands out.
 */
export function personRoleLabel(
  key: PersonRoleKey,
  vocabulary: Lexicon,
): string {
  const role = BY_KEY.get(key);
  if (!role) return key;
  return vocabulary[role.term] ?? role.default.singular;
}

/** The same role's plural, for a heading or an empty state. */
export function personRoleLabelPlural(
  key: PersonRoleKey,
  vocabulary: Lexicon,
): string {
  const role = BY_KEY.get(key);
  if (!role) return key;
  return vocabulary[`${role.term}_plural`] ?? role.default.plural;
}

/**
 * The vocabulary the portal renders against: what the organization calls what
 * it lends, plus what it calls the people it works with.
 *
 * One map because one placeholder engine reads it -- the nav tree, the person
 * segments and the aspect cards all hold templates and none of them should have
 * to know which of the two settings a word came from.
 */
export function withPersonRoleTerms(
  lexicon: Lexicon,
  labels: PersonRoleLabels,
): Lexicon {
  return { ...lexicon, ...personRoleTerms(labels) };
}

/**
 * The platform's own words for everything a template can name.
 *
 * This, rather than `DEFAULT_LEXICON`, is what a surface with no tenant behind
 * it falls back to: the nav tree and the person registries hold `{donor}` as
 * well as `{collection}`, and a default that knew only half of them would put
 * braces on screen. That is the direction a mistake here should fail in -- a
 * generic label is a small loss, a brace is a bug an administrator has to
 * report.
 */
export const DEFAULT_VOCABULARY: Lexicon = withPersonRoleTerms(
  DEFAULT_LEXICON,
  DEFAULT_PERSON_ROLE_LABELS,
);
