// #1620: the upload link page's form -- the rights paragraphs, the box scoped
// to the files, and the picker held shut until it is ticked.
import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

mock.module("./actions", () => ({
  createLinkUploadSlotsAction: async () => ({ slots: [] }),
  recordLinkUploadAction: async () => ({ ok: true, ref: "r" }),
  deleteLinkUploadAction: async () => ({ ok: true }),
}));

const { LinkUploadForm } = await import("./link-upload-form");

function renderForm(rightsParagraphs: string[]) {
  return render(
    <LinkUploadForm
      token="t"
      orgName="Example Org"
      label="Sam — photographer"
      expiresAt="Nov 1, 2026, 11:59 PM MDT"
      rightsParagraphs={rightsParagraphs}
    />,
  );
}

describe("LinkUploadForm", () => {
  test("says who is uploading and until when", () => {
    renderForm([]);
    expect(screen.getByText("Sam — photographer")).toBeTruthy();
    expect(screen.getByText(/Nov 1, 2026, 11:59 PM MDT/)).toBeTruthy();
  });

  test("the picker stays shut until the rights box is ticked", async () => {
    const user = userEvent.setup();
    renderForm(["We use them on our site."]);
    const upload = screen.getByRole("button", { name: /Upload photos/ });
    expect((upload as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("checkbox"));
    expect((upload as HTMLButtonElement).disabled).toBe(false);
  });

  test("written terms are shown and agreed to", () => {
    renderForm(["We use them on our site.", "Email us to stop."]);
    expect(
      screen.getByRole("heading", {
        name: "How Example Org uses what you upload",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Email us to stop.")).toBeTruthy();
    expect(screen.getByText(/I agree to the terms above/)).toBeTruthy();
  });

  test("with no terms, the box says only what the platform does", () => {
    renderForm([]);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(
      screen.getByText(/Example Org may keep them with this event/),
    ).toBeTruthy();
  });
});
