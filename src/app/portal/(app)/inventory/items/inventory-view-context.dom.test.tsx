import { afterEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  InventoryViewProvider,
  useInventoryView,
  type InventoryViewMode,
} from "./inventory-view-context";

const STORAGE_KEY = "chattersnow:inventory-items-view";

function Probe() {
  const { view, setView } = useInventoryView();
  return (
    <>
      <output>{view}</output>
      <button type="button" onClick={() => setView("list")}>
        List
      </button>
    </>
  );
}

function renderProvider(defaultView?: InventoryViewMode) {
  render(
    <InventoryViewProvider defaultView={defaultView}>
      <Probe />
    </InventoryViewProvider>,
  );
  return screen.getByRole("status");
}

afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
});

describe("InventoryViewProvider", () => {
  test("opens on the list where nothing says otherwise", () => {
    expect(renderProvider()).toHaveTextContent("list");
  });

  test("opens on the gallery where the page asks for it", () => {
    // The page asks for it on a phone (#1090): the grid is 2-up at 390px and
    // the photograph is what identifies a gear item.
    expect(renderProvider("gallery")).toHaveTextContent("gallery");
  });

  test("a stored choice beats the default in both directions", async () => {
    window.localStorage.setItem(STORAGE_KEY, "list");
    expect(renderProvider("gallery")).toHaveTextContent("list");
  });

  test("choosing on a phone is remembered", async () => {
    renderProvider("gallery");
    await userEvent.setup().click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("status")).toHaveTextContent("list");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("list");
  });
});
