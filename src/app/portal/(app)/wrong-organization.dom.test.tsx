import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { Tenant } from "@/lib/portal/tenants";

mock.module("next/image", () => ({ default: () => null }));
mock.module("next/navigation", () => ({ useRouter: () => ({}) }));

const { WrongOrganization } = await import("./wrong-organization");

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Chatter Snow",
    slug: "chatter-snow",
    plan: "white_label",
    custom_domain: "chattersnow.org",
    ...overrides,
  };
}

describe("WrongOrganization", () => {
  test("names both organizations", () => {
    // Someone who followed a stale bookmark has no idea why their password
    // "stopped working", so the screen has to say which portal this is as well
    // as which one they belong to.
    render(
      <WrongOrganization hostTenantName="Example Demo" tenants={[tenant()]} />,
    );

    expect(screen.getByText(/Example Demo portal/)).toBeInTheDocument();
    expect(screen.getByText(/belongs to Chatter Snow/)).toBeInTheDocument();
  });

  test("links to the portal on the organization's own domain", () => {
    // The canonical /portal path rather than a host-aware one: it resolves on
    // an apex that redirects to portal.<apex>, on one that does not, and on a
    // portal. host of its own. See tenantPortalUrl.
    render(
      <WrongOrganization hostTenantName="Example Demo" tenants={[tenant()]} />,
    );

    expect(
      screen.getByRole("link", { name: "Go to Chatter Snow" }),
    ).toHaveAttribute("href", "https://chattersnow.org/portal/home");
  });

  test("names an organization with no domain but does not link to it", () => {
    // A tenant provisioned before its DNS is set up has no host to offer. It
    // is still the answer to "so where do I go?", so it is named -- with the
    // link omitted rather than pointed somewhere wrong.
    render(
      <WrongOrganization
        hostTenantName="Example Demo"
        tenants={[tenant({ custom_domain: null })]}
      />,
    );

    expect(screen.getByText(/belongs to Chatter Snow/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("offers every organization the account belongs to", () => {
    render(
      <WrongOrganization
        hostTenantName="Example Demo"
        tenants={[
          tenant(),
          tenant({
            id: "22222222-2222-4222-8222-222222222222",
            name: "Second Nonprofit",
            custom_domain: "second.example.org",
          }),
        ]}
      />,
    );

    expect(
      screen.getByText(/belongs to Chatter Snow and Second Nonprofit/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  test("always offers a way out of the session", () => {
    // Without this the screen is a dead end for anyone who reached it by
    // signing in with the wrong account.
    render(
      <WrongOrganization
        hostTenantName="Example Demo"
        tenants={[tenant({ custom_domain: null })]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });
});
