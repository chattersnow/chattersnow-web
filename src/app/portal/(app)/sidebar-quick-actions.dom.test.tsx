import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SidebarQuickActions } from "./sidebar-quick-actions";

describe("SidebarQuickActions", () => {
  test("renders nothing for a role with no quick actions", () => {
    const { container } = render(<SidebarQuickActions roles={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing for a board member", () => {
    const { container } = render(<SidebarQuickActions roles={["board"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("shows only 'New event' for an event coordinator", () => {
    render(<SidebarQuickActions roles={["event_coordinator"]} />);
    expect(screen.getByRole("button", { name: /new event/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record donation/i })).not.toBeInTheDocument();
  });

  test("shows only 'Record donation' for a volunteer", () => {
    render(<SidebarQuickActions roles={["volunteer"]} />);
    expect(screen.queryByRole("button", { name: /new event/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record donation/i })).toBeInTheDocument();
  });

  test("shows both actions for an admin", () => {
    render(<SidebarQuickActions roles={["admin"]} />);
    expect(screen.getByRole("button", { name: /new event/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record donation/i })).toBeInTheDocument();
  });
});
