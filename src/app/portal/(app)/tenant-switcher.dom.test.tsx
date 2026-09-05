import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Tenant } from "@/lib/portal/tenants";

const switchTenantActionMock = mock(async (_tenantId: string) => null);
const toastErrorMock = mock((_message: string) => "");

// next/image resolves a relative src against the document URL, which happy-dom
// registers as about:blank -- getImgProps then throws "Invalid URL". The logo
// is decorative here (alt=""), so nothing in these assertions needs it.
mock.module("next/image", () => ({ default: () => null }));

mock.module("./tenant-switcher-actions", () => ({
  switchTenantAction: switchTenantActionMock,
}));
mock.module("@/components/ui/toast", () => ({
  toast: {
    error: toastErrorMock,
    success: mock(() => ""),
    close: mock(() => {}),
  },
  Toaster: () => null,
}));

const { TenantSwitcher } = await import("./tenant-switcher");

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Chatter Snow",
    slug: "chatter-snow",
    ...overrides,
  };
}

const OTHER = tenant({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Second Nonprofit",
  slug: "second-nonprofit",
});

describe("TenantSwitcher", () => {
  beforeEach(() => {
    switchTenantActionMock.mockClear();
    toastErrorMock.mockClear();
  });

  test("renders a plain link, not a control, for a single membership", () => {
    // Every user is in this state until a second tenant is provisioned. A menu
    // whose only entry is the thing you are already looking at is noise, and
    // it would put a button where a link has always been.
    render(
      <TenantSwitcher tenants={[tenant()]} currentTenantId={tenant().id} />,
    );

    expect(screen.getByRole("link", { name: "Chatter Snow" })).toHaveAttribute(
      "href",
      "/portal/home",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("names the link even when the sidebar hides the text", () => {
    // The name span carries group-data-[collapsible=icon]:hidden, which takes
    // it out of the accessibility tree along with the pixels, and the logo is
    // decorative -- so without an explicit label the link is nameless exactly
    // when it is the only thing left in the header.
    render(
      <TenantSwitcher tenants={[tenant()]} currentTenantId={tenant().id} />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "aria-label",
      "Chatter Snow",
    );
  });

  test("still renders a home link when the tenant read failed", () => {
    // The layout shows <NoTenant /> for an account that genuinely has no
    // tenant, so an empty list here means a failed read and a degraded shell.
    // Returning null would leave the sidebar header blank.
    render(<TenantSwitcher tenants={[]} currentTenantId={null} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/portal/home",
    );
  });

  test("becomes a menu naming the current tenant once there are two", () => {
    render(
      <TenantSwitcher
        tenants={[tenant(), OTHER]}
        currentTenantId={tenant().id}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Current account: Chatter Snow" }),
    ).toBeInTheDocument();
  });

  test("says a choice is owed rather than naming a tenant it is not scoped to", () => {
    // current_tenant_id() returns null for a multi-tenant user who has not
    // chosen. Falling back to the first name would claim a scope the rest of
    // the page does not actually have.
    render(
      <TenantSwitcher tenants={[tenant(), OTHER]} currentTenantId={null} />,
    );

    expect(
      screen.getByRole("button", { name: "Choose an account" }),
    ).toBeInTheDocument();
  });

  test("switches to the tenant that was picked", async () => {
    const user = userEvent.setup();
    render(
      <TenantSwitcher
        tenants={[tenant(), OTHER]}
        currentTenantId={tenant().id}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Current account: Chatter Snow" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /Second Nonprofit/ }),
    );

    expect(switchTenantActionMock).toHaveBeenCalledWith(OTHER.id);
  });

  test("does not re-switch to the tenant already in scope", async () => {
    const user = userEvent.setup();
    render(
      <TenantSwitcher
        tenants={[tenant(), OTHER]}
        currentTenantId={tenant().id}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Current account: Chatter Snow" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /Chatter Snow/ }),
    );

    expect(switchTenantActionMock).not.toHaveBeenCalled();
  });
});
