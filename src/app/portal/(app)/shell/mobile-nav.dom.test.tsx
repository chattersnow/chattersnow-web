import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionMap } from "@/lib/auth/permissions";
import { ThemeProvider } from "@/components/theme-provider";

// The sheet seeds its open section from the route, so each case needs its own
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

const { MobileNav } = await import("./mobile-nav");

// Enough to make Administration, Governance and their sub-items visible; the
// permission filtering itself is covered by nav-guards.test.ts.
const ADMIN: PermissionMap = { administration: "manage", governance: "manage" };

async function openSheet(permissions: PermissionMap = ADMIN) {
  render(
    <ThemeProvider>
      <MobileNav permissions={permissions} />
    </ThemeProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "More" }));
  return screen.getByRole("dialog");
}

describe("MobileNav's More sheet", () => {
  // The bug this guards against: every section and every sub-item rendered
  // flat, which is several phone screens of list, so the section you wanted
  // was below the fold before you had read a heading.
  test("a section with sub-items starts collapsed", async () => {
    pathname = "/portal/home";
    await openSheet();

    expect(
      screen.getByRole("button", { name: "Administration" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
  });

  test("tapping a section reveals its sub-items", async () => {
    pathname = "/portal/home";
    await openSheet();

    const trigger = screen.getByRole("button", { name: "Administration" });
    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
  });

  // One at a time, the way the desktop sidebar behaves: two long sections open
  // together is most of the scrolling back.
  test("opening one section closes the one already open", async () => {
    pathname = "/portal/home";
    await openSheet();

    await userEvent.click(screen.getByRole("button", { name: "Governance" }));
    expect(screen.getByRole("link", { name: "Bylaws" })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Administration" }),
    );
    expect(screen.getByRole("button", { name: "Governance" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("the section owning the current route opens with the sheet", async () => {
    pathname = "/portal/administration/users";
    await openSheet();

    expect(
      screen.getByRole("button", { name: "Administration" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
  });

  // The account rows are a band of the sheet's flex column rather than the tail
  // of the scrolling list, which is what keeps them on screen. Asserted on the
  // structure because jsdom lays nothing out: the list is the scroll container,
  // and the footer is not inside it.
  test("the account rows sit outside the scrolling list", async () => {
    pathname = "/portal/home";
    const sheet = await openSheet();

    const logOut = screen.getByRole("button", { name: "Log out" });
    const scroller = sheet.querySelector(".overflow-y-auto");
    expect(scroller).not.toBeNull();
    expect(scroller!.contains(logOut)).toBe(false);
    expect(
      scroller!.contains(screen.getByRole("link", { name: "My Account" })),
    ).toBe(false);
  });
});
