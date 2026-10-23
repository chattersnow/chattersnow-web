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
          photoOffset: 0,
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

  test("a later page numbers its photos from the page's offset and shows its pager", () => {
    render(
      <EventGallery
        eventName="Rail Jam"
        media={{
          photos: [{ id: "p21", url: "https://s/p21", caption: null }],
          videos: [],
          photoCount: 104,
          photoOffset: 20,
        }}
        pager={<nav aria-label="Gallery pages" />}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Open Photo 21 of 104 from Rail Jam",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Gallery pages" }),
    ).toBeTruthy();
  });

  test("videos alone get their own heading and no photos link", () => {
    render(
      <EventGallery
        eventName="Rail Jam"
        media={{
          photos: [],
          videos: [{ id: "v1", url: "https://s/v1", caption: null }],
          photoCount: 0,
          photoOffset: 0,
        }}
        allPhotosHref="/events/e/1/photos"
      />,
    );
    expect(screen.getByRole("heading", { name: "Videos" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /View all photos/ })).toBeNull();
  });
});
