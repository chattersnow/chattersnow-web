import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PERSON_ROLE_LABELS,
  DEFAULT_VOCABULARY,
  withPersonRoleTerms,
} from "@/lib/person-roles";
import { DEFAULT_LEXICON } from "@/lib/lexicon";
import { accountEmailToShow, rolesFor } from "./people-shared";

const NONE = {
  is_donor: false,
  is_sponsor: false,
  is_volunteer: false,
  is_attendee: false,
  is_staff: false,
  is_partner: false,
  is_recipient: false,
};

/** Everything `rolesFor` is willing to name, plus the one role it is not. */
const EVERY_ROLE = {
  is_donor: true,
  is_sponsor: true,
  is_volunteer: true,
  is_attendee: true,
  is_staff: true,
  is_partner: true,
  is_recipient: true,
};

/** An organization that runs classes rather than a charity. */
const STUDIO = withPersonRoleTerms(DEFAULT_LEXICON, {
  ...DEFAULT_PERSON_ROLE_LABELS,
  is_attendee: { singular: "Student", plural: "Students" },
  is_staff: { singular: "Instructor", plural: "Instructors" },
});

describe("rolesFor", () => {
  test("returns an empty list when no roles are set", () => {
    expect(rolesFor(NONE, DEFAULT_VOCABULARY)).toEqual([]);
  });

  test("returns labels in registry order regardless of which flags are set", () => {
    expect(
      rolesFor(
        { ...NONE, is_sponsor: true, is_volunteer: true },
        DEFAULT_VOCABULARY,
      ),
    ).toEqual(["Sponsor", "Volunteer"]);
  });

  test("returns all labels when every role is set", () => {
    expect(rolesFor(EVERY_ROLE, DEFAULT_VOCABULARY)).toEqual([
      "Donor",
      "Sponsor",
      "Volunteer",
      "Attendee",
      "Staff Member",
      "Partner",
    ]);
  });

  /**
   * #1073. The Roles column renders across a browsable, searchable directory,
   * and the flag behind it is `security definer` while the distributions it
   * describes are RLS-gated on `inventory:view` -- so a Recipient chip would be
   * legible to almost every portal reader while the rows behind it would not
   * be, and it would assemble the roster of aid recipients the ticket
   * explicitly declined. The aspect card is the disclosure; this list is not.
   */
  test("never names Recipient, even when the flag is set", () => {
    expect(rolesFor(EVERY_ROLE, DEFAULT_VOCABULARY)).not.toContain("Recipient");
    expect(
      rolesFor({ ...NONE, is_recipient: true }, DEFAULT_VOCABULARY),
    ).toEqual([]);
  });

  // A tenant that renames the role does not get it back, either: the exclusion
  // is on the key, which is what the schema and the routes mean (#911).
  test("a renamed Recipient stays out too", () => {
    const shop = withPersonRoleTerms(DEFAULT_LEXICON, {
      ...DEFAULT_PERSON_ROLE_LABELS,
      is_recipient: { singular: "Customer", plural: "Customers" },
    });
    expect(rolesFor({ ...NONE, is_recipient: true }, shop)).toEqual([]);
  });

  // #911: the column is what the tenant calls the role, not what the schema
  // calls the flag.
  test("reads the tenant's words", () => {
    expect(
      rolesFor({ ...NONE, is_attendee: true, is_staff: true }, STUDIO),
    ).toEqual(["Student", "Instructor"]);
  });
});

/**
 * #1193. The Accounts segment's one column of real news: most records share an
 * address with the account linked to them, because that is how the claim was
 * matched in the first place, so the useful case is the one where they differ.
 */
describe("accountEmailToShow", () => {
  test("names the account when it signs in as somebody else", () => {
    expect(
      accountEmailToShow({
        email: "robin@work.example",
        account_email: "robin.ashford@gmail.example",
      }),
    ).toBe("robin.ashford@gmail.example");
  });

  test("says nothing when the two are the same address", () => {
    expect(
      accountEmailToShow({
        email: "Robin@Example.test",
        account_email: "robin@example.test",
      }),
    ).toBeNull();
  });

  test("names the account when the record has no address of its own", () => {
    expect(
      accountEmailToShow({ email: null, account_email: "robin@example.test" }),
    ).toBe("robin@example.test");
  });

  // Null is what a reader without constituent_claims:view gets back from the
  // computed column, and what every segment but Accounts gets for not asking.
  test("says nothing when the account email was not read", () => {
    expect(accountEmailToShow({ email: "robin@example.test" })).toBeNull();
    expect(
      accountEmailToShow({ email: "robin@example.test", account_email: null }),
    ).toBeNull();
  });
});
