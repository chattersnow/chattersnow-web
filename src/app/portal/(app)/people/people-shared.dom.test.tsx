import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PersonAccountBadge } from "./people-shared";

// #1192. The badge used to render on any non-null auth_user_id and call it
// "Portal user". Since #1162 that column is also written for every approved
// constituent, who holds no role and cannot open the portal at all -- so the
// one label said the opposite of the truth about the larger of the two groups.
// These three cases are the whole of the distinction.
describe("PersonAccountBadge", () => {
  test("an account holding a role is labelled by the portal", () => {
    render(
      <PersonAccountBadge
        person={{ auth_user_id: "auth-1", has_portal_access: true }}
      />,
    );

    expect(screen.getByText("Portal access")).toBeInTheDocument();
    expect(screen.queryByText("Website account")).not.toBeInTheDocument();
  });

  test("an account holding no role is labelled by the website", () => {
    render(
      <PersonAccountBadge
        person={{ auth_user_id: "auth-2", has_portal_access: false }}
      />,
    );

    expect(screen.getByText("Website account")).toBeInTheDocument();
    expect(screen.queryByText("Portal access")).not.toBeInTheDocument();
  });

  // The narrow `people(...)` selects across the app carry neither column, and
  // they are selects of people rather than of accounts: unknown means no role
  // known, which is the website account.
  test("an unknown role reads as the website account", () => {
    render(<PersonAccountBadge person={{ auth_user_id: "auth-3" }} />);

    expect(screen.getByText("Website account")).toBeInTheDocument();
  });

  test("a person with no account carries no badge", () => {
    const { container } = render(
      <PersonAccountBadge person={{ auth_user_id: null }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
