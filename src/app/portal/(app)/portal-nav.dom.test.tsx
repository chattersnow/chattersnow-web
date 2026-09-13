import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionMap } from "@/lib/auth/permissions";
import { SidebarProvider } from "@/components/ui/sidebar";

// The nav seeds its open section from the route, so each case needs its own
// pathname. Re-mocked here rather than using test/setup.ts's "/" default, and
// read through a mutable holder so a single module import serves every case.
let pathname = "/portal/home";
mock.module("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: () => {},
  permanentRedirect: () => {},
  notFound: () => {},
}));

const { PortalNav } = await import("./portal-nav");

// Enough to make Administration and its sub-items visible; the permission
// filtering itself is covered by nav-guards.test.ts.
const ADMIN: PermissionMap = { administration: "manage" };

function renderNav(permissions: PermissionMap = ADMIN) {
  return render(
    <SidebarProvider>
      <PortalNav permissions={permissions} />
    </SidebarProvider>,
  );
}

describe("PortalNav", () => {
  test("a section with sub-items starts closed and hides them", () => {
    pathname = "/portal/home";
    renderNav();

    expect(
      screen.getByRole("button", { name: "Administration" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
  });

  test("clicking a section opens it and reveals its sub-items", async () => {
    pathname = "/portal/home";
    renderNav();

    const trigger = screen.getByRole("button", { name: "Administration" });
    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // aria-controls is Base UI's, and it must resolve to a real element --
    // pointing it at an unmounted panel is the a11y failure the hand-written
    // pair used to guard against.
    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
  });

  test("the section owning the current route is open on first render", () => {
    pathname = "/portal/administration/users";
    renderNav();

    expect(
      screen.getByRole("button", { name: "Administration" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
  });
});
