import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";

let params = new URLSearchParams();
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  useSearchParams: () => params,
}));

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({ error: null }),
    },
  }),
}));

const { LoginForm } = await import("./login-form");

const NOTICE = /signed out after a period of inactivity/i;

describe("LoginForm inactivity notice", () => {
  afterEach(() => {
    params = new URLSearchParams();
  });

  test("explains an idle sign-out", () => {
    params = new URLSearchParams("reason=idle");
    render(<LoginForm />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    // Being timed out is the portal working as intended, so the notice must
    // not be dressed up as an error. The variant only shows up in the class
    // list -- there's no data attribute to assert on.
    const alert = screen.getByText(NOTICE).closest('[data-slot="alert"]');
    expect(alert?.className).toContain("text-card-foreground");
    expect(alert?.className).not.toContain("text-destructive");
  });

  test("stays quiet on a normal visit", () => {
    render(<LoginForm />);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test("still reports a real sign-in error", () => {
    params = new URLSearchParams("error=oauth_failed");
    render(<LoginForm />);

    expect(screen.getByText(/Google sign-in failed/i)).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
