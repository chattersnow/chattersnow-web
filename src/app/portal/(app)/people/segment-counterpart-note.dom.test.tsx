// The reverse link of #1198, on the People → Accounts segment.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { PermissionMap } from "@/lib/auth/permissions";
import { ACCOUNTS_SEGMENT } from "./people-segments";
import { SegmentCounterpartNote } from "./segment-counterpart-note";

const counterpart = ACCOUNTS_SEGMENT.counterpart!;

// Everyone who reaches this segment holds these two; what varies is whether
// they also administer the portal's own users.
const REVIEWER: PermissionMap = {
  people: "view",
  constituent_claims: "view",
};

describe("SegmentCounterpartNote", () => {
  test("says what the segment lists, for every reader", () => {
    for (const permissions of [
      REVIEWER,
      { ...REVIEWER, administration: "manage" } as PermissionMap,
    ]) {
      const { unmount } = render(
        <SegmentCounterpartNote
          counterpart={counterpart}
          permissions={permissions}
        />,
      );
      expect(
        screen.getByText(/hold an account on the organization's website/),
      ).toBeTruthy();
      unmount();
    }
  });

  test("links back to Users for an administrator", () => {
    render(
      <SegmentCounterpartNote
        counterpart={counterpart}
        permissions={{ ...REVIEWER, administration: "manage" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Administration › Users" });
    expect(link.getAttribute("href")).toBe("/portal/administration/users");
  });

  // A claims reviewer is typically development or comms staff, who hold no
  // `administration` at all -- the page they would land on bounces them.
  test("names no link for a reviewer who does not administer users", () => {
    const { container } = render(
      <SegmentCounterpartNote
        counterpart={counterpart}
        permissions={REVIEWER}
      />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).not.toContain("Administration");
  });
});
