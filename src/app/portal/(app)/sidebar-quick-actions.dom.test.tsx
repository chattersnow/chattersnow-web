import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SidebarQuickActions } from "./sidebar-quick-actions";
import type { PermissionMap } from "@/lib/auth/permissions";

describe("SidebarQuickActions", () => {
  test("renders nothing with no permissions", () => {
    const { container } = render(<SidebarQuickActions permissions={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing for a board member", () => {
    const permissions: PermissionMap = { finance_reports: "view", governance: "manage" };
    const { container } = render(<SidebarQuickActions permissions={permissions} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("shows only 'New event' for an event coordinator", () => {
    const permissions: PermissionMap = { events: "manage" };
    render(<SidebarQuickActions permissions={permissions} />);
    expect(screen.getByRole("button", { name: /new event/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record donation/i })).not.toBeInTheDocument();
  });

  test("shows only 'Record donation' for a volunteer", () => {
    const permissions: PermissionMap = { inventory_intake: "manage" };
    render(<SidebarQuickActions permissions={permissions} />);
    expect(screen.queryByRole("button", { name: /new event/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record donation/i })).toBeInTheDocument();
  });

  test("shows both actions for an admin", () => {
    const permissions: PermissionMap = { events: "manage", finance: "manage" };
    render(<SidebarQuickActions permissions={permissions} />);
    expect(screen.getByRole("button", { name: /new event/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record donation/i })).toBeInTheDocument();
  });
});
