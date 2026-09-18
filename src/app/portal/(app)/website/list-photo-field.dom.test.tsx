import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { contentSlot, type ListItem } from "@/lib/site-content";
import { ListEditor } from "./list-editor";

const SLOT = contentSlot("about_team.members");
if (!SLOT || SLOT.type !== "list") {
  throw new Error("about_team.members must be a list slot");
}
const slot = SLOT;

/** The Meet the Team page's photo slots as an editor would have them set. */
const IMAGES = {
  about_team_photo_cass: "https://example.test/cass.jpg",
  about_team_photo_rickie: null,
  about_team_photo_sofie: null,
  about_team_photo: "https://example.test/shared.jpg",
  about_team_hero_photo: null,
};

function member(overrides: Partial<ListItem> = {}): ListItem {
  return {
    name: "Ada Lovelace",
    photo_url: "",
    photo_slot: "",
    bio: ["A short biography."],
    ...overrides,
  };
}

function renderEditor(
  item: ListItem,
  images: Record<string, string | null> = IMAGES,
) {
  const onChange = mock((_items: ListItem[]) => {});
  render(
    <ListEditor
      slot={slot}
      items={[item]}
      images={images}
      onChange={onChange}
    />,
  );
  return {
    onChange,
    /** The row as the editor last reported it. */
    stored: () => onChange.mock.calls.at(-1)?.[0][0],
    photo: () => screen.getByRole("combobox", { name: /Photo/ }),
    async pick(name: string | RegExp) {
      const user = userEvent.setup();
      await user.click(screen.getByRole("combobox", { name: /Photo/ }));
      await screen.findByRole("listbox");
      await user.click(await screen.findByRole("option", { name }));
    },
  };
}

/**
 * The two boxes #922 replaced: "Photo URL" and "Image slot", both free text,
 * both optional, with the precedence between them stated only in the slot's
 * description and the valid slot names written out in three other slots'
 * descriptions further down the same page.
 */
describe("a team member's photo control", () => {
  test("asks one question, not two free-text boxes", () => {
    renderEditor(member());

    expect(screen.queryByRole("textbox", { name: /Photo URL/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Image slot/ })).toBeNull();
    expect(screen.getByRole("combobox", { name: /Photo/ })).toBeTruthy();
  });

  test("offers this page's photo slots, and no name can be typed", async () => {
    const view = renderEditor(member());
    const user = userEvent.setup();

    await user.click(view.photo());
    await screen.findByRole("listbox");

    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toContain("Team photo — Cass Lainez");
    expect(options).toContain("Team photo — Sofie Chavez");
    // The shared fallback and the free link are the other two answers; the
    // hero strip at the top of the page is not a team member's photo.
    expect(options).toContain("Team member photo (shared)");
    expect(options).toContain("A link of their own");
    expect(options.join(" ")).not.toContain("top photo");
  });

  test("choosing a photo stores its slot and drops any link", async () => {
    const view = renderEditor(
      member({ photo_url: "https://example.test/old.jpg" }),
    );

    await view.pick("Team photo — Cass Lainez");

    expect(view.stored()).toEqual(
      member({ photo_url: "", photo_slot: "about_team_photo_cass" }),
    );
  });

  test("choosing a link of their own asks for it and drops the slot", async () => {
    const view = renderEditor(member({ photo_slot: "about_team_photo_cass" }));

    await view.pick("A link of their own");

    expect(view.stored()).toEqual(member({ photo_slot: "" }));
    const box = screen.getByRole("textbox", { name: "Photo link" });
    await userEvent.setup().type(box, "https://example.test/ada.jpg");
    expect(view.stored()).toEqual(
      member({ photo_url: "https://example.test/ada.jpg", photo_slot: "" }),
    );
  });

  test("says which picture the page will use", () => {
    renderEditor(member({ photo_slot: "about_team_photo_cass" }));
    expect(
      screen.getByText("Showing “Team photo — Cass Lainez”."),
    ).toBeTruthy();
  });

  test("says so when the shared photo is what shows", () => {
    renderEditor(member());
    expect(
      screen.getByText("No photo of their own, so “Team member photo” shows."),
    ).toBeTruthy();
  });

  // The crop is stored on the photo's own URL as a `#crop=` fragment (#1250),
  // and the rule that buys is that the fragment never reaches a person as
  // text: it is a rect nobody can picture, sitting in a box people type in.
  test("crops the photo here when the row owns it, and hides the fragment", () => {
    renderEditor(
      member({
        photo_url: "https://example.test/ada.jpg#crop=0.2,0.1,0.5,0.5",
      }),
    );

    expect(screen.getByRole("group", { name: "Crop of Photo" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Photo link" })).toHaveValue(
      "https://example.test/ada.jpg",
    );
  });

  test("leaves a borrowed photo's crop with the photo", () => {
    renderEditor(member({ photo_slot: "about_team_photo_cass" }), {
      ...IMAGES,
      about_team_photo_cass:
        "https://example.test/cass.jpg#crop=0.2,0.1,0.5,0.5",
    });

    // The row is showing a slot's photo, so the crop belongs to that slot and
    // is set where the slot is. Here the picture stays a preview -- cropped,
    // so the row still shows what the page shows -- and the sentence says so.
    expect(screen.queryByRole("group", { name: "Crop of Photo" })).toBeNull();
    expect(
      screen.getByText(/Its crop is set with “Team photo — Cass Lainez”/),
    ).toBeTruthy();
  });

  // A name typed into the old free-text box, or a slot since removed. It read
  // as the shared placeholder with nothing to say the name was wrong.
  test("shows a stored slot the registry no longer has", async () => {
    const view = renderEditor(member({ photo_slot: "about_team_photo_cas" }));
    const user = userEvent.setup();

    await user.click(view.photo());
    await screen.findByRole("listbox");

    expect(
      screen.getByRole("option", { name: /no longer a photo on this page/ }),
    ).toBeTruthy();
  });
});
