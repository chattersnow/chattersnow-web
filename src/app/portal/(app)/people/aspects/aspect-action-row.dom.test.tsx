import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { PermissionMap } from "@/lib/auth/permissions";
import { ASPECT_ACTIONS } from "./aspect-actions";
import { AspectActions } from "./aspect-action-row";

function hrefsFor(
  permissions: PermissionMap,
  actions = ASPECT_ACTIONS.is_donor,
) {
  const { container } = render(
    <AspectActions
      aspect={{ label: "Donor", actions }}
      permissions={permissions}
    />,
  );
  return {
    container,
    hrefs: [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    ),
  };
}

describe("AspectActions", () => {
  test("renders nothing at all when no action passes", () => {
    // Not an empty group: the card checks for a null actions slot to decide
    // whether to render a footer.
    const { container, hrefs } = hrefsFor({ people: "manage" });
    expect(hrefs).toEqual([]);
    expect(container.innerHTML).toBe("");
  });

  test("renders only the links the viewer's modules allow", () => {
    expect(hrefsFor({ finance: "manage" }).hrefs).toEqual([
      "/portal/finance/donations",
    ]);
    expect(hrefsFor({ inventory: "view" }).hrefs).toEqual([
      "/portal/inventory/donations",
    ]);
    expect(
      hrefsFor({ finance: "manage", inventory_intake: "manage" }).hrefs,
    ).toEqual(["/portal/finance/donations", "/portal/inventory/donations"]);
  });

  test("names the group for screen readers", () => {
    const { container } = hrefsFor({ finance: "manage" });
    expect(
      container.querySelector('[role="group"]')?.getAttribute("aria-label"),
    ).toBe("Donor actions");
  });
});
