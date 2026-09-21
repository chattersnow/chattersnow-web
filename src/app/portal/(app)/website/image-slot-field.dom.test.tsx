import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/image builds a real URL from the src at render, which happy-dom refuses.
mock.module("next/image", () => ({ default: () => null }));

const UPLOADED =
  "http://127.0.0.1:54321/storage/v1/object/public/site-photos/tenant-1/photo-1.jpg";
const SECOND =
  "http://127.0.0.1:54321/storage/v1/object/public/site-photos/tenant-1/photo-2.jpg";

const uploadSitePhotoMock = mock<
  (
    file: File,
    path: string,
  ) => Promise<{ url: string; path: string } | { error: string }>
>(async (_file, path) => ({ url: UPLOADED, path }));

const deleteSitePhotoMock = mock<(path: string) => Promise<void>>(
  async () => {},
);

// Only the browser-only half is mocked; the pure path parsing still runs, so a
// test that asserts a deletion is also asserting that the crop fragment on the
// replaced value did not stop the object being recognised.
mock.module("@/lib/storage/site-photos", () => ({
  SITE_PHOTOS_BUCKET: "site-photos",
  SITE_PHOTO_MAX_EDGE: 2400,
  sitePhotoPathFromUrl: (url: string | null) => {
    if (!url) return null;
    const at = url.indexOf("/site-photos/");
    return at === -1
      ? null
      : url.slice(at + "/site-photos/".length).split("#")[0] || null;
  },
  uploadSitePhoto: uploadSitePhotoMock,
  deleteSitePhoto: deleteSitePhotoMock,
}));

const createSitePhotoPathActionMock = mock<
  () => Promise<{ path: string } | { error: string }>
>(async () => ({ path: "tenant-1/photo-1.jpg" }));

mock.module("./site-photo-actions", () => ({
  createSitePhotoPathAction: createSitePhotoPathActionMock,
}));

const { ImageSlotField } = await import("./image-slot-field");

function pngFile(name = "hero.png") {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: "image/png",
  });
}

/**
 * The label belongs to the slot's `Field`, not to this component -- so the
 * test supplies it, which is also the assertion that `id` lands on the file
 * input rather than on the link box.
 */
function renderSlot(props: {
  value?: string | null;
  onChange?: (value: string | null) => void;
}) {
  return render(
    <>
      <label htmlFor="content-site_images.home_photo">Homepage photo</label>
      <ImageSlotField
        id="content-site_images.home_photo"
        label="Homepage photo"
        ratio="16/9"
        value={props.value ?? null}
        onChange={props.onChange ?? (() => {})}
      />
    </>,
  );
}

describe("ImageSlotField", () => {
  beforeEach(() => {
    uploadSitePhotoMock.mockClear();
    deleteSitePhotoMock.mockClear();
    createSitePhotoPathActionMock.mockClear();
    createSitePhotoPathActionMock.mockImplementation(async () => ({
      path: "tenant-1/photo-1.jpg",
    }));
    uploadSitePhotoMock.mockImplementation(async (_file, path) => ({
      url: UPLOADED,
      path,
    }));
  });

  // The slot's own label names the upload control, and the link box carries a
  // second one of its own -- so both halves are reachable by name.
  test("both controls have an accessible name", () => {
    renderSlot({});
    expect(screen.getByLabelText("Homepage photo")).toBeTruthy();
    expect(screen.getByLabelText("Or paste a link")).toBeTruthy();
  });

  // The upload path awaits the path action and then the upload before it
  // touches state, and React schedules that re-render on its own queue rather
  // than the one userEvent's delay drains (#1104). Everything downstream of an
  // upload waits.
  test("stores the uploaded URL as the slot's value", async () => {
    const onChange = mock<(value: string | null) => void>(() => {});
    renderSlot({ onChange });

    await userEvent.upload(screen.getByLabelText("Homepage photo"), pngFile());

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(UPLOADED));
    expect(uploadSitePhotoMock).toHaveBeenCalledTimes(1);
  });

  // A different picture needs a different crop, so the rect from the photo
  // being replaced must not ride along onto the new one.
  test("drops the previous photo's crop", async () => {
    const onChange = mock<(value: string | null) => void>(() => {});
    renderSlot({ value: `${SECOND}#crop=0.1,0.2,0.5,0.5`, onChange });

    await userEvent.upload(screen.getByLabelText("Homepage photo"), pngFile());

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(UPLOADED));
  });

  test("shows a failed upload inline and leaves the slot alone", async () => {
    uploadSitePhotoMock.mockImplementation(async () => ({
      error: "That photo is too large.",
    }));
    const onChange = mock<(value: string | null) => void>(() => {});
    renderSlot({ onChange });

    await userEvent.upload(screen.getByLabelText("Homepage photo"), pngFile());

    expect(await screen.findByText("That photo is too large.")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  // A refusal has to arrive before the browser re-encodes a 12 MP photo.
  test("surfaces a refused path without uploading", async () => {
    createSitePhotoPathActionMock.mockImplementation(async () => ({
      error: "You don't have permission to change the site's photos.",
    }));
    const onChange = mock<(value: string | null) => void>(() => {});
    renderSlot({ onChange });

    await userEvent.upload(screen.getByLabelText("Homepage photo"), pngFile());

    expect(
      await screen.findByText(
        "You don't have permission to change the site's photos.",
      ),
    ).toBeTruthy();
    expect(uploadSitePhotoMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  // The guard that keeps the live site's picture up: a value that arrived as
  // the slot's own may still be what the published page is serving, whatever
  // the editor does to the draft on screen.
  test("never deletes a photo this session did not upload", async () => {
    renderSlot({ value: `${SECOND}#crop=0.1,0.2,0.5,0.5` });

    await userEvent.upload(screen.getByLabelText("Homepage photo"), pngFile());

    await waitFor(() => expect(uploadSitePhotoMock).toHaveBeenCalledTimes(1));
    expect(deleteSitePhotoMock).not.toHaveBeenCalled();
  });

  // ...and the other half of that rule: an object uploaded and then replaced
  // before anything was saved is nobody's picture, and is collected.
  test("deletes a photo it uploaded and then replaced", async () => {
    let value: string | null = null;
    const { rerender } = render(
      <>
        <label htmlFor="slot">Homepage photo</label>
        <ImageSlotField
          id="slot"
          label="Homepage photo"
          ratio="16/9"
          value={value}
          onChange={(next) => {
            value = next;
          }}
        />
      </>,
    );

    await userEvent.upload(screen.getByLabelText("Homepage photo"), pngFile());
    await waitFor(() => expect(value).toBe(UPLOADED));

    // The editor re-renders the slot with what the upload stored, exactly as
    // the content editor does once its state has moved on.
    rerender(
      <>
        <label htmlFor="slot">Homepage photo</label>
        <ImageSlotField
          id="slot"
          label="Homepage photo"
          ratio="16/9"
          value={value}
          onChange={(next) => {
            value = next;
          }}
        />
      </>,
    );

    createSitePhotoPathActionMock.mockImplementation(async () => ({
      path: "tenant-1/photo-2.jpg",
    }));
    uploadSitePhotoMock.mockImplementation(async (_file, path) => ({
      url: SECOND,
      path,
    }));

    await userEvent.upload(screen.getByLabelText("Homepage photo"), pngFile());

    await waitFor(() =>
      expect(deleteSitePhotoMock).toHaveBeenCalledWith("tenant-1/photo-1.jpg"),
    );
  });

  // The paste box is not the lesser half: a Drive link still goes in, comes
  // back out as itself, and uploads nothing.
  test("a pasted link is stored as typed", async () => {
    const onChange = mock<(value: string | null) => void>(() => {});
    renderSlot({ onChange });

    await userEvent.type(screen.getByLabelText("Or paste a link"), "h");

    expect(onChange).toHaveBeenCalledWith("h");
    expect(uploadSitePhotoMock).not.toHaveBeenCalled();
  });

  test("an emptied link box is the slot's default, not an empty string", async () => {
    const onChange = mock<(value: string | null) => void>(() => {});
    renderSlot({ value: "https://example.com/photo.jpg", onChange });

    await userEvent.clear(screen.getByLabelText("Or paste a link"));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
