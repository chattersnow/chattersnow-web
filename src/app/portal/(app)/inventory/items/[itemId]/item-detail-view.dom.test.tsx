import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { InventoryItem } from "../inventory-shared";
import { ItemDetailView } from "./item-detail-view";

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    description: "Winter jacket",
    type: null,
    category_id: "category-jacket",
    category_key: "jacket",
    category_label: "Jacket",
    category_group_label: "Outerwear",
    size: "M",
    gender: "unisex",
    condition: "good",
    face_value: 40,
    status: "available",
    intended_use: "gear_library",
    photo_url: null,
    notes: "Barely used",
    assetTag: null,
    holdRequester: null,
    holdNotes: null,
    holdRequest: null,
    ...overrides,
  };
}

function renderView(item: InventoryItem, canManage: boolean) {
  render(
    <ItemDetailView
      item={item}
      categories={[]}
      canManage={canManage}
      history={[]}
    />,
  );
}

describe("ItemDetailView", () => {
  test("names the item, with category, status and code under it", () => {
    renderView(makeItem({ assetTag: "ABC234" }), false);

    expect(
      screen.getByRole("heading", { level: 1, name: "Winter jacket" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Jacket · Available · ABC234")).toBeInTheDocument();
    for (const title of ["Details", "Photo", "Tag"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByText("Hold")).not.toBeInTheDocument();
  });

  test("an untagged item offers Generate code to a manager, and nothing to copy", () => {
    renderView(makeItem(), true);

    expect(
      screen.getByRole("button", { name: "Generate code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit item" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy tag URL" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Print label" }),
    ).not.toBeInTheDocument();
  });

  test("a tagged item can be copied and printed by a viewer, but not edited", () => {
    renderView(makeItem({ assetTag: "ABC234" }), false);

    expect(
      screen.getByRole("button", { name: "Copy tag URL" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Print label" })).toHaveAttribute(
      "href",
      "/portal/inventory/items/labels?items=11111111-1111-4111-8111-111111111111",
    );
    expect(
      screen.queryByRole("button", { name: "Edit item" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generate code" }),
    ).not.toBeInTheDocument();
    // Web NFC is Chrome-on-Android only, and the test DOM has none.
    expect(
      screen.queryByRole("button", { name: "Write NFC tag" }),
    ).not.toBeInTheDocument();
  });

  test("a viewer with no code to act on gets no toolbar", () => {
    const { container } = render(
      <ItemDetailView
        item={makeItem()}
        categories={[]}
        canManage={false}
        history={[]}
      />,
    );
    expect(container.querySelector(".rainbow-surface")).toBeNull();
    expect(
      screen.getByText("This item has no tag code yet."),
    ).toBeInTheDocument();
  });

  test("a manager can assign a numbered code, and unassign the one it holds", () => {
    renderView(makeItem({ numberedCode: "CSN-007" }), true);

    expect(
      screen.getByText("Jacket · Available · CSN-007"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change numbered code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unassign code CSN-007" }),
    ).toBeInTheDocument();
  });

  test("an item that has left inventory is offered no numbered code", () => {
    renderView(makeItem({ status: "distributed" }), true);

    expect(
      screen.queryByRole("button", { name: "Assign numbered code" }),
    ).not.toBeInTheDocument();
  });

  test("a reserved item shows who holds it", () => {
    renderView(
      makeItem({
        status: "reserved",
        holdRequester: {
          id: "person-1",
          name: "Jamie Rivera",
          email: "jamie@example.org",
          phone: null,
        },
        holdNotes: "Pick up Saturday",
      }),
      false,
    );

    expect(screen.getByText("Hold")).toBeInTheDocument();
    expect(
      screen.getByText("Jamie Rivera · jamie@example.org"),
    ).toBeInTheDocument();
    expect(screen.getByText("Pick up Saturday")).toBeInTheDocument();
  });
});
