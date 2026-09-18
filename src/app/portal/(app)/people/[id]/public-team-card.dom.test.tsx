import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../../test/toast-testing";
import type { PublicTeamActionResult } from "../actions";
import * as PeopleActions from "../actions";

const saveMock = mock<
  (personId: string, formData: FormData) => Promise<PublicTeamActionResult>
>(async () => ({ success: true }));
const removeMock = mock<(personId: string) => Promise<PublicTeamActionResult>>(
  async () => ({ success: true }),
);

mock.module("../actions", () => ({
  ...PeopleActions,
  savePublicTeamMemberAction: saveMock,
  removePublicTeamMemberAction: removeMock,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const { PublicTeamCard } = await import("./public-team-card");

const listed = {
  id: "m1",
  public_role: "Programs lead",
  photo_url: null,
  bio: "First paragraph.\n\nSecond paragraph.",
  sort_order: 2,
};

const CONSEQUENCE = /Puts this person on the public Meet the Team page/;

describe("PublicTeamCard", () => {
  beforeEach(() => {
    saveMock.mockClear();
    saveMock.mockImplementation(async () => ({ success: true }));
    removeMock.mockClear();
  });

  // The crop rides on the photo's URL as a `#crop=` fragment (#1250). This
  // card prints that URL as text, which is the one place the encoding would
  // read as gibberish to the person looking at it (#1251).
  test("prints the photo link without the crop on the end of it", async () => {
    render(
      <PublicTeamCard
        personId="p1"
        personName="Rowan"
        membership={{
          ...listed,
          photo_url: "https://example.test/rowan.jpg#crop=0.2,0.1,0.5,0.5",
        }}
        canManage={true}
      />,
    );

    expect(
      screen.getByText("https://example.test/rowan.jpg"),
    ).toBeInTheDocument();

    // And in the editor the picture is the control, so the rect is set by
    // moving it rather than by typing four numbers no one can picture.
    await userEvent.click(
      screen.getByRole("button", { name: "Edit team page listing" }),
    );

    expect(screen.getByRole("textbox", { name: "Photo URL" })).toHaveValue(
      "https://example.test/rowan.jpg",
    );
    expect(
      screen.getByRole("group", { name: "Crop of their photo" }),
    ).toBeInTheDocument();
  });

  test("says the person is not listed, and what listing them would do", () => {
    render(
      <PublicTeamCard
        personId="p1"
        personName="Rowan"
        membership={null}
        canManage={true}
      />,
    );

    expect(
      screen.getByText("Not on the public Meet the Team page."),
    ).toBeInTheDocument();
    expect(screen.getByText(CONSEQUENCE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add to the team page" }),
    ).toBeInTheDocument();
  });

  test("offers no controls to someone who cannot manage people", () => {
    render(
      <PublicTeamCard
        personId="p1"
        personName="Rowan"
        membership={listed}
        canManage={false}
      />,
    );

    expect(screen.getByText("Programs lead")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("shows a listing as paragraphs, with the consequence beside it", () => {
    render(
      <PublicTeamCard
        personId="p1"
        personName="Rowan"
        membership={listed}
        canManage={true}
      />,
    );

    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
    expect(screen.getByText(CONSEQUENCE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit team page listing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove from the team page" }),
    ).toBeInTheDocument();
  });

  test("adding fills the form in, submits it, and returns to view mode", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <PublicTeamCard
        personId="p1"
        personName="Rowan"
        membership={null}
        canManage={true}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Add to the team page" }),
    );
    await user.type(
      screen.getByLabelText("Role shown publicly"),
      "Board chair",
    );
    await user.type(
      screen.getByLabelText("Public biography"),
      "Line one.{enter}{enter}Line two.",
    );
    await user.click(
      screen.getByRole("button", { name: "Add to the team page" }),
    );

    expect(saveMock).toHaveBeenCalledTimes(1);
    const [personId, formData] = saveMock.mock.calls[0];
    expect(personId).toBe("p1");
    expect(formData.get("publicRole")).toBe("Board chair");
    expect(formData.get("bio")).toBe("Line one.\n\nLine two.");
    expect(
      await screen.findByText("Not on the public Meet the Team page."),
    ).toBeInTheDocument();
  });

  test("editing pre-fills the form from the listing", async () => {
    const user = userEvent.setup();
    render(
      <PublicTeamCard
        personId="p1"
        personName="Rowan"
        membership={listed}
        canManage={true}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit team page listing" }),
    );

    expect(screen.getByLabelText("Role shown publicly")).toHaveValue(
      "Programs lead",
    );
    expect(screen.getByLabelText("Order")).toHaveValue(2);
    expect(screen.getByLabelText("Public biography")).toHaveValue(
      "First paragraph.\n\nSecond paragraph.",
    );
  });

  test("announces a failed save instead of claiming success", async () => {
    const user = userEvent.setup();
    saveMock.mockImplementation(async () => ({
      error: "Photo URL must start with http:// or https://.",
    }));
    renderWithToaster(
      <PublicTeamCard
        personId="p1"
        personName="Rowan"
        membership={listed}
        canManage={true}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit team page listing" }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Photo URL must start with http:// or https://."),
    ).toBeInTheDocument();
    // Still in edit mode: the form is where the fix happens.
    expect(screen.getByLabelText("Role shown publicly")).toBeInTheDocument();
  });

  test("removing asks first, then calls the action", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <PublicTeamCard
        personId="p1"
        personName="Rowan"
        membership={listed}
        canManage={true}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Remove from the team page" }),
    );
    expect(removeMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    expect(removeMock).toHaveBeenCalledWith("p1");
  });
});
