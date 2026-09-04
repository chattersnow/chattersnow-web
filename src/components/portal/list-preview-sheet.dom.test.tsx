import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListPreviewSheet } from "./list-preview-sheet";

function Harness({ rows }: { rows: string[] }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((row) =>
    row.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <ListPreviewSheet
      title="Registrants"
      description="20 registrations"
      triggerLabel={`View all ${rows.length} registrants`}
      searchPlaceholder="Search name"
      searchLabel="Search registrants"
      query={query}
      onQueryChange={setQuery}
      totalCount={rows.length}
      filteredCount={filtered.length}
      actions={<button type="button">+ Add registrant</button>}
    >
      <ul>
        {filtered.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </ListPreviewSheet>
  );
}

const rows = ["Liz Limonite", "Jules Letterman", "Cass Lainez"];

describe("ListPreviewSheet", () => {
  test("opens the full list with its title, description and actions", async () => {
    const user = userEvent.setup();
    render(<Harness rows={rows} />);

    await user.click(
      screen.getByRole("button", { name: "View all 3 registrants" }),
    );

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText("Registrants")).toBeInTheDocument();
    expect(sheet.getByText("20 registrations")).toBeInTheDocument();
    expect(
      sheet.getByRole("button", { name: "+ Add registrant" }),
    ).toBeInTheDocument();
    for (const row of rows) expect(sheet.getByText(row)).toBeInTheDocument();
  });

  test("search narrows the list and announces the visible count", async () => {
    const user = userEvent.setup();
    render(<Harness rows={rows} />);
    await user.click(
      screen.getByRole("button", { name: "View all 3 registrants" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Showing 3 of 3",
    );

    await user.type(
      within(dialog).getByRole("searchbox", { name: "Search registrants" }),
      "letterman",
    );

    expect(within(dialog).getByText("Jules Letterman")).toBeInTheDocument();
    expect(within(dialog).queryByText("Liz Limonite")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Showing 1 of 3",
    );
  });

  test("closing clears the filter so the next open starts fresh", async () => {
    const user = userEvent.setup();
    render(<Harness rows={rows} />);
    const open = screen.getByRole("button", { name: "View all 3 registrants" });

    await user.click(open);
    let dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("searchbox", { name: "Search registrants" }),
      "letterman",
    );
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await user.click(open);
    dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("searchbox", { name: "Search registrants" }),
    ).toHaveValue("");
    expect(within(dialog).getByText("Liz Limonite")).toBeInTheDocument();
  });
});
