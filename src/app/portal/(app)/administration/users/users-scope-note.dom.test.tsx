// The half of #1198 that lives on Administration → Users: the page says what
// it is, and names the list that answers the other question -- but only for a
// reader who can open that list.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UsersScopeNote } from "./users-scope-note";

describe("UsersScopeNote", () => {
  test("states the page's scope whether or not the other list is reachable", () => {
    for (const canViewWebsiteAccounts of [true, false]) {
      const { unmount } = render(
        <UsersScopeNote canViewWebsiteAccounts={canViewWebsiteAccounts} />,
      );
      expect(
        screen.getByText(/People who can sign in to the portal/),
      ).toBeTruthy();
      unmount();
    }
  });

  test("links to the Accounts segment for a claims reviewer", () => {
    render(<UsersScopeNote canViewWebsiteAccounts />);
    const link = screen.getByRole("link", { name: "People › Accounts" });
    expect(link.getAttribute("href")).toBe("/portal/people/accounts");
  });

  // `constituent_claims:view` carries the module entitlement (20260910010000),
  // so this is also the tenant that never bought the constituent area.
  test("names no link for a reader who cannot reach the segment", () => {
    const { container } = render(
      <UsersScopeNote canViewWebsiteAccounts={false} />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).not.toContain("Accounts");
  });
});
