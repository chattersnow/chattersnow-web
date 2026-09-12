import { describe, expect, test } from "bun:test";
import { DEFAULT_LEXICON, applyLexicon } from "./lexicon";
import {
  DEFAULT_PERSON_ROLE_LABELS,
  DEFAULT_VOCABULARY,
  MAX_PERSON_ROLE_LABEL_LENGTH,
  PERSON_ROLES,
  PERSON_ROLE_KEYS,
  PERSON_ROLE_LABELS_SETTING_KEY,
  personRoleLabel,
  personRoleLabelField,
  personRoleLabelPlural,
  personRoleLabelsFromValue,
  personRoleTerms,
  storedPersonRoleLabels,
  withPersonRoleTerms,
} from "./person-roles";
import { LEXICON_TERMS } from "./lexicon";
import { NAV_ITEMS, visibleNavItems } from "./portal/nav";

/** A shop: clients and suppliers, and nothing that fundraises. */
const SHOP = personRoleLabelsFromValue({
  is_attendee: { singular: "Customer", plural: "Customers" },
  is_partner: { singular: "Supplier", plural: "Suppliers" },
  is_staff: { singular: "Team Member", plural: "Crew" },
});

describe("PERSON_ROLES", () => {
  test("is the six derived roles, in the order every surface renders", () => {
    expect(PERSON_ROLES.map((role) => role.key)).toEqual([
      "is_donor",
      "is_sponsor",
      "is_volunteer",
      "is_attendee",
      "is_staff",
      "is_partner",
    ]);
    expect([...PERSON_ROLE_KEYS]).toEqual(PERSON_ROLES.map((role) => role.key));
  });

  test("every default is within the length the admin action enforces", () => {
    for (const role of PERSON_ROLES) {
      expect(role.default.singular.length).toBeLessThanOrEqual(
        MAX_PERSON_ROLE_LABEL_LENGTH,
      );
      expect(role.default.plural.length).toBeLessThanOrEqual(
        MAX_PERSON_ROLE_LABEL_LENGTH,
      );
    }
  });

  // Both registries feed one placeholder map, so a term claimed twice would
  // have one of them silently win.
  test("claims no term the lexicon already claims", () => {
    const lexicon = new Set(LEXICON_TERMS.map((term) => term.key));
    for (const role of PERSON_ROLES) {
      expect(lexicon.has(role.term), role.term).toBe(false);
      expect(lexicon.has(`${role.term}_plural`), role.term).toBe(false);
    }
  });

  test("the words are stored under one settings key", () => {
    expect(PERSON_ROLE_LABELS_SETTING_KEY).toBe("people.role_labels");
    expect(personRoleLabelField("is_donor", "plural")).toBe("is_donor.plural");
  });
});

describe("personRoleLabelsFromValue", () => {
  test("falls back to the platform's word for a role the tenant has not set", () => {
    expect(SHOP.is_attendee.singular).toBe("Customer");
    expect(SHOP.is_donor).toEqual({ singular: "Donor", plural: "Donors" });
  });

  // An organization that renames only the plural keeps our singular rather
  // than losing both.
  test("falls back per word, not per role", () => {
    const labels = personRoleLabelsFromValue({
      is_staff: { plural: "Crew" },
    });

    expect(labels.is_staff).toEqual({
      singular: "Staff Member",
      plural: "Crew",
    });
  });

  test("treats a blank word as unset", () => {
    expect(
      personRoleLabelsFromValue({ is_donor: { singular: "   " } }).is_donor
        .singular,
    ).toBe("Donor");
  });

  test("ignores anything that is not the shape this setting holds", () => {
    for (const value of [null, "Donors", 7, [], { is_donor: "Supporter" }]) {
      expect(personRoleLabelsFromValue(value)).toEqual(
        DEFAULT_PERSON_ROLE_LABELS,
      );
    }
  });

  test("ignores a role key no registry entry claims", () => {
    expect(
      storedPersonRoleLabels({ is_member: { singular: "Member" } }),
    ).toEqual({});
  });

  // What the Administration panel shows: the tenant's own words only, so an
  // administrator can tell which of the twelve fields they chose.
  test("stored keeps only what the tenant actually set", () => {
    expect(
      storedPersonRoleLabels({
        is_attendee: { singular: "Customer", plural: "" },
        is_donor: {},
      }),
    ).toEqual({ is_attendee: { singular: "Customer" } });
  });
});

describe("the words reach the template engine", () => {
  test("as `{term}` and `{term_plural}`", () => {
    const terms = personRoleTerms(SHOP);

    expect(terms.attendee).toBe("Customer");
    expect(terms.attendee_plural).toBe("Customers");
    expect(terms.donor).toBe("Donor");
  });

  test("alongside the lexicon's own words rather than instead of them", () => {
    const vocabulary = withPersonRoleTerms(DEFAULT_LEXICON, SHOP);

    expect(applyLexicon("{collection} and {attendee_plural}", vocabulary)).toBe(
      "Inventory and Customers",
    );
  });

  test("and lower-case mid-sentence", () => {
    expect(
      applyLexicon(
        "No {staff_plural:lower} added yet",
        withPersonRoleTerms(DEFAULT_LEXICON, SHOP),
      ),
    ).toBe("No crew added yet");
  });

  test("personRoleLabel reads one role directly", () => {
    const vocabulary = withPersonRoleTerms(DEFAULT_LEXICON, SHOP);

    expect(personRoleLabel("is_partner", vocabulary)).toBe("Supplier");
    expect(personRoleLabelPlural("is_partner", vocabulary)).toBe("Suppliers");
    // A vocabulary that carries no person terms at all -- a subtree with no
    // provider above it -- still names the role rather than printing a brace.
    expect(personRoleLabel("is_partner", DEFAULT_LEXICON)).toBe("Partner");
  });
});

/**
 * The ticket's own acceptance: the nav, which is where "Donors" sat whether or
 * not the tenant fundraised.
 */
describe("the People section of the sidebar", () => {
  const everything = new Proxy({}, { get: () => "manage" }) as Parameters<
    typeof visibleNavItems
  >[0];

  const peopleSubItems = (vocabulary = DEFAULT_VOCABULARY) =>
    visibleNavItems(everything, vocabulary)
      .find((item) => item.value === "people")
      ?.subItems?.map((sub) => sub.label);

  test("a tenant that sets nothing reads exactly what it always did", () => {
    expect(peopleSubItems()).toEqual([
      "People",
      "Donors",
      "Sponsors",
      "Volunteers",
      "Attendees",
      "Staff",
      "Partners",
      "Organizations",
    ]);
  });

  test("a tenant's own words rename it", () => {
    expect(peopleSubItems(withPersonRoleTerms(DEFAULT_LEXICON, SHOP))).toEqual([
      "People",
      "Donors",
      "Sponsors",
      "Volunteers",
      "Customers",
      "Crew",
      "Suppliers",
      "Organizations",
    ]);
  });

  // The keys are the platform's: the routes, the flags on people_with_roles
  // and person_role_tags are all written against them.
  test("but no route or key is renamed", () => {
    const people = NAV_ITEMS.find((item) => item.value === "people");

    expect(people?.subItems?.map((sub) => sub.href)).toContain(
      "/portal/donors",
    );
    expect(people?.subItems?.map((sub) => sub.value)).toContain("staff");
  });
});
