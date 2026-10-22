import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { EMPTY_PUBLIC_EVENT_MEDIA } from "@/lib/public-event-gallery";
import { EventGallery } from "./event-gallery";

describe("EventGallery", () => {
  test("renders nothing when nothing is public", () => {
    const { container } = render(
      <EventGallery
        eventName="Rail Jam"
        media={EMPTY_PUBLIC_EVENT_MEDIA}
        allPhotosHref="/events/e/1/photos"
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  test("shows photos, videos and the link to the whole gallery", () => {
    render(
      <EventGallery
        eventName="Rail Jam"
        media={{
          photos: [
            { id: "p1", url: "https://s/p1", caption: null },
            { id: "p2", url: "https://s/p2", caption: "Big air" },
          ],
          videos: [{ id: "v1", url: "https://s/v1", caption: null }],
          photoCount: 12,
        }}
        allPhotosHref="/events/e/1/photos"
      />,
    );
    const section = screen
      .getByRole("heading", { name: "Photos" })
      .closest("section")!;
    expect(
      within(section).getByRole("button", {
        name: "Open Photo 1 of 12 from Rail Jam",
      }),
    ).toBeTruthy();
    expect(
      within(section).getByRole("button", { name: "Open Big air" }),
    ).toBeTruthy();
    expect(
      within(section).getByRole("heading", { name: "Videos" }),
    ).toBeTruthy();
    expect(section.querySelector("video")?.getAttribute("src")).toBe(
      "https://s/v1",
    );
    expect(
      within(section)
        .getByRole("link", { name: "View all photos (12)" })
        .getAttribute("href"),
    ).toBe("/events/e/1/photos");
    // Nothing about who sent it or what it was called.
    expect(section.textContent).not.toMatch(/\.jpe?g|\.mov/i);
  });

  test("videos alone get their own heading and no photos link", () => {
    render(
      <EventGallery
        eventName="Rail Jam"
        media={{
          photos: [],
          videos: [{ id: "v1", url: "https://s/v1", caption: null }],
          photoCount: 0,
        }}
        allPhotosHref="/events/e/1/photos"
      />,
    );
    expect(screen.getByRole("heading", { name: "Videos" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /View all photos/ })).toBeNull();
  });
});
