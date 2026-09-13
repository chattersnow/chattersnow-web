import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import type { ReactNode } from "react";

const pushMock = mock<(href: string) => void>(() => {});
const router = {
  push: pushMock,
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: async () => {},
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/portal/people",
  useSearchParams: () => new URLSearchParams(),
}));

const { ListLink, ListNavigationProvider, ListPendingRegion } =
  await import("./list-navigation");

/**
 * `<Link>` ignores clicks unless a router context is present. Outside the
 * Next bundler `next/link` resolves to the pages-router build, so that is the
 * context to satisfy; both builds call `onNavigate` the same way.
 */
function WithRouter({ children }: { children: ReactNode }) {
  return (
    <RouterContext.Provider value={router as unknown as NextRouter}>
      {children}
    </RouterContext.Provider>
  );
}

describe("list navigation", () => {
  test("a ListLink outside any provider is an ordinary link", () => {
    render(<ListLink href="/portal/people?sort=email">Email</ListLink>);
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "/portal/people?sort=email",
    );
  });

  test("inside a provider a click navigates through the router, keeping the href", async () => {
    const user = userEvent.setup();
    pushMock.mockClear();
    render(
      <WithRouter>
        <ListNavigationProvider>
          <ListLink href="/portal/people?sort=email">Email</ListLink>
        </ListNavigationProvider>
      </WithRouter>,
    );
    const link = screen.getByRole("link", { name: "Email" });
    expect(link).toHaveAttribute("href", "/portal/people?sort=email");
    await user.click(link);
    expect(pushMock).toHaveBeenCalledWith("/portal/people?sort=email");
  });

  test("a GET form submitting inside the region marks it busy", () => {
    render(
      <ListNavigationProvider>
        <form method="get" action="/portal/people">
          <button type="submit">Search</button>
        </form>
        <ListPendingRegion>
          <p>rows</p>
        </ListPendingRegion>
      </ListNavigationProvider>,
    );
    const region = screen.getByText("rows").parentElement!.parentElement!;
    expect(region).not.toHaveAttribute("aria-busy");
    fireEvent.submit(
      screen.getByRole<HTMLButtonElement>("button", { name: "Search" }).form!,
    );
    expect(region).toHaveAttribute("aria-busy", "true");
  });

  test("a form whose own handler prevents the default does not", () => {
    render(
      <ListNavigationProvider>
        <form onSubmit={(event) => event.preventDefault()}>
          <button type="submit">Save</button>
        </form>
        <ListPendingRegion>
          <p>rows</p>
        </ListPendingRegion>
      </ListNavigationProvider>,
    );
    const region = screen.getByText("rows").parentElement!.parentElement!;
    fireEvent.submit(
      screen.getByRole<HTMLButtonElement>("button", { name: "Save" }).form!,
    );
    expect(region).not.toHaveAttribute("aria-busy");
  });
});
