import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PersonFormFields,
  emptyPersonForm,
  type PersonFormState,
} from "./person-form-fields";

function ControlledForm({
  onChange,
}: {
  onChange?: (form: PersonFormState) => void;
}) {
  const [form, setForm] = useState<PersonFormState>(() => emptyPersonForm());
  return (
    <PersonFormFields
      form={form}
      idPrefix="test"
      update={(key, value) => {
        setForm((prev) => {
          const next = { ...prev, [key]: value };
          onChange?.(next);
          return next;
        });
      }}
    />
  );
}

describe("PersonFormFields", () => {
  test("typing in the name field updates the form state", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "Jane Donor");

    expect(nameInput).toHaveValue("Jane Donor");
  });

  test("toggling a role checkbox flips only that role", async () => {
    const user = userEvent.setup();
    let latest: PersonFormState | undefined;
    render(<ControlledForm onChange={(form) => (latest = form)} />);

    await user.click(screen.getByRole("checkbox", { name: "Sponsor" }));

    expect(latest?.roles).toEqual({
      is_donor: false,
      is_sponsor: true,
      is_volunteer: false,
      is_attendee: false,
    });
  });

  test("renders all four role checkboxes unchecked by default", () => {
    render(<ControlledForm />);

    expect(screen.getByRole("checkbox", { name: "Donor" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Volunteer" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Attendee" }),
    ).not.toBeChecked();
  });

  test("choosing Organization updates personType", async () => {
    const user = userEvent.setup();
    let latest: PersonFormState | undefined;
    render(<ControlledForm onChange={(form) => (latest = form)} />);

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Organization" }));

    expect(latest?.personType).toBe("organization");
  });

  test("the rider profile is for individuals, the logo and website for organizations", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);

    expect(screen.getByLabelText("Rides")).toBeInTheDocument();
    expect(screen.queryByLabelText("Logo URL")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Organization" }));

    expect(screen.getByLabelText("Logo URL")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rides")).not.toBeInTheDocument();
  });
});
