import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { ConstituentAccountNav } from "@/lib/constituent/account-nav";
import { AccountMenu, AccountSheetRows } from "./account-menu";

const OFF: ConstituentAccountNav = { enabled: false };
const SIGNED_OUT: ConstituentAccountNav = { enabled: true, signedIn: false };
const SIGNED_IN: ConstituentAccountNav = {
  enabled: true,
  signedIn: true,
  label: "Rickie",
  email: "rickie@chattersnow.org",
};

describe("AccountMenu", () => {
  // The whole point of the module gate: a tenant that has not bought
  // constituent accounts must not advertise them, so there is no control at
  // all rather than a disabled or hidden one.
  test("renders nothing for a tenant without the module", () => {
    const { container } = render(<AccountMenu account={OFF} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("is a link to sign in when signed out", () => {
    render(<AccountMenu account={SIGNED_OUT} />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/my/sign-in");
  });

  // The name is only on screen from `xl` up, so the accessible name is what
  // carries it at every other width. A screen reader should not have to open
  // the menu to learn whose account it is.
  test("names the person on the trigger when signed in", () => {
    render(<AccountMenu account={SIGNED_IN} />);
    expect(
      screen.getByRole("button", { name: "Your account, Rickie" }),
    ).toBeInTheDocument();
  });

  test("falls back to a generic name when the claims carry none", () => {
    render(
      <AccountMenu account={{ ...SIGNED_IN, label: null, email: null }} />,
    );
    expect(
      screen.getByRole("button", { name: "Your account" }),
    ).toBeInTheDocument();
  });
});

describe("AccountSheetRows", () => {
  const noop = () => {};

  test("renders nothing for a tenant without the module", () => {
    const { container } = render(
      <AccountSheetRows account={OFF} onNavigate={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("offers sign in when signed out", () => {
    render(<AccountSheetRows account={SIGNED_OUT} onNavigate={noop} />);
    expect(screen.getByRole("link", { name: /Sign in/ })).toHaveAttribute(
      "href",
      "/my/sign-in",
    );
    expect(screen.queryByRole("button", { name: /Sign out/ })).toBeNull();
  });

  // Unlike the header's dropdown these rows are always rendered, so sign out
  // is one tap from anywhere in the menu rather than behind a second control.
  test("offers the account and sign out when signed in", () => {
    render(<AccountSheetRows account={SIGNED_IN} onNavigate={noop} />);
    expect(screen.getByRole("link", { name: /Your account/ })).toHaveAttribute(
      "href",
      "/my",
    );
    expect(
      screen.getByRole("button", { name: /Sign out/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("rickie@chattersnow.org")).toBeInTheDocument();
  });
});
