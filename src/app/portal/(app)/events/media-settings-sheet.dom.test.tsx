import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as MediaActions from "./media-actions";

const galleryMock = mock(async () => ({ success: true as const }));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
mock.module("./media-actions", () => ({
  ...MediaActions,
  updateEventPublicGalleryEnabledAction: galleryMock,
}));

const { MediaSettingsSheet } = await import("./media-settings-sheet");

beforeEach(() => galleryMock.mockClear());

describe("MediaSettingsSheet", () => {
  test("the Public event gallery switch shows the setting and saves a change", async () => {
    render(
      <MediaSettingsSheet enabled retentionDays={null} publicGalleryEnabled />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Media/ }));
    const gallery = await screen.findByRole("switch", {
      name: "Public event gallery",
    });
    expect(gallery.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByText(/videos only once someone marks them public/),
    ).toBeTruthy();
    expect(
      screen.getByText(/and leave the public gallery with them/),
    ).toBeTruthy();

    await userEvent.click(gallery);
    expect(galleryMock).toHaveBeenCalledWith(false);
  });

  test("shows the gallery as off when it is", async () => {
    render(
      <MediaSettingsSheet
        enabled
        retentionDays={null}
        publicGalleryEnabled={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Media/ }));
    const gallery = await screen.findByRole("switch", {
      name: "Public event gallery",
    });
    expect(gallery.getAttribute("aria-checked")).toBe("false");
  });
});
