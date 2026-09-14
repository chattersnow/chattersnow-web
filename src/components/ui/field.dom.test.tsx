import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Field, FieldLabel } from "./field";
import { Input } from "./input";

// Issue #1070: no form told anyone which fields were required until they tried
// to submit one. The asterisk is for people reading the page; people listening
// to it are already told by the control's own `required`, so these assert that
// the marker changes nothing about the accessible name.
describe("FieldLabel required", () => {
  test("renders no marker without the prop", () => {
    render(
      <Field>
        <FieldLabel htmlFor="phone">Phone</FieldLabel>
        <Input id="phone" />
      </Field>,
    );

    expect(screen.getByText("Phone").textContent).toBe("Phone");
  });

  test("marks the label visually without changing what is announced", () => {
    render(
      <Field>
        <FieldLabel htmlFor="name" required>
          Name
        </FieldLabel>
        <Input id="name" required />
      </Field>,
    );

    // The marker is decoration: the input's own `required` is what assistive
    // technology announces, so the accessible name stays the plain label and
    // nobody hears "Name star" or "Name required, required".
    // The regex is a testing-library quirk, not a behaviour: it matches on
    // textContent, which includes the aria-hidden asterisk that a real
    // accessibility tree leaves out.
    const input = screen.getByLabelText(/^Name\s*\*$/) as HTMLInputElement;
    expect(input.required).toBe(true);

    const marker = screen.getByText("*");
    expect(marker.getAttribute("aria-hidden")).toBe("true");
  });
});
