import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortHeaderButton, SortHeaderLink } from "./sort-header-link";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";

describe("sort headers", () => {
  test("announce their state, which no sorted table used to do", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sortDirection="asc">
              <SortHeaderLink
                href="?sort=amount&dir=desc"
                label="Amount"
                dir="asc"
              />
            </TableHead>
            <TableHead sortDirection={null}>
              <SortHeaderLink
                href="?sort=date&dir=asc"
                label="Date"
                dir={null}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    const [amount, date] = screen.getAllByRole("columnheader");
    expect(amount).toHaveAttribute("aria-sort", "ascending");
    expect(date).toHaveAttribute("aria-sort", "none");
  });

  test("a header with no sortDirection stays unannounced", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    expect(screen.getByRole("columnheader")).not.toHaveAttribute("aria-sort");
  });

  test("the link and button variants read the same to a screen reader", () => {
    const { unmount } = render(
      <SortHeaderLink href="?sort=amount" label="Amount" dir="desc" />,
    );
    expect(
      screen.getByRole("link", { name: /Amount, sorted descending/ }),
    ).toBeInTheDocument();
    unmount();

    render(<SortHeaderButton label="Amount" dir="desc" onSort={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Amount, sorted descending/ }),
    ).toBeInTheDocument();
  });

  test("the button variant reports the sort it would apply", async () => {
    const user = userEvent.setup();
    let sorted = false;
    render(
      <SortHeaderButton
        label="Date"
        dir={null}
        onSort={() => {
          sorted = true;
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Date, not sorted/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(sorted).toBe(true);
  });
});
