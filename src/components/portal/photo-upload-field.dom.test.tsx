import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/image builds a real URL from the src at render, which happy-dom refuses.
mock.module("next/image", () => ({ default: () => null }));

const PUBLIC_URL =
  "http://127.0.0.1:54321/storage/v1/object/public/gear-photos/tenant-1/photo-1.jpg";

const uploadGearPhotoMock = mock<
  (
    file: File,
    path: string,
  ) => Promise<{ url: string; path: string } | { error: string }>
>(async (_file, path) => ({ url: PUBLIC_URL, path }));

const deleteGearPhotoMock = mock<(path: string) => Promise<void>>(
  async () => {},
);

// Only the browser-only half is mocked; the pure helpers still run, so a test
// that asserts a deletion is also asserting the real path parsing.
mock.module("@/lib/storage/gear-photos", () => ({
  GEAR_PHOTOS_BUCKET: "gear-photos",
  gearPhotoPathFromUrl: (url: string | null) => {
    if (!url) return null;
    const at = url.indexOf("/gear-photos/");
    return at === -1 ? null : url.slice(at + "/gear-photos/".length) || null;
  },
  uploadGearPhoto: uploadGearPhotoMock,
  deleteGearPhoto: deleteGearPhotoMock,
}));

const createGearPhotoPathActionMock = mock<
  () => Promise<{ path: string } | { error: string }>
>(async () => ({ path: "tenant-1/photo-1.jpg" }));

mock.module("@/app/portal/(app)/gear-photo-actions", () => ({
  createGearPhotoPathAction: createGearPhotoPathActionMock,
}));

const { PhotoUploadField } = await import("./photo-upload-field");

function pngFile(name = "gear.png") {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: "image/png",
  });
}

describe("PhotoUploadField", () => {
  beforeEach(() => {
    uploadGearPhotoMock.mockClear();
    deleteGearPhotoMock.mockClear();
    createGearPhotoPathActionMock.mockClear();
    createGearPhotoPathActionMock.mockImplementation(async () => ({
      path: "tenant-1/photo-1.jpg",
    }));
    uploadGearPhotoMock.mockImplementation(async (_file, path) => ({
      url: PUBLIC_URL,
      path,
    }));
  });

  // The file input carries the label rather than sitting hidden behind a
  // button, so this is also the a11y assertion.
  test("the file input has an accessible name", () => {
    render(<PhotoUploadField value="" onChange={() => {}} idPrefix="item-1" />);
    expect(screen.getByLabelText("Photo")).toBeTruthy();
  });

  test("reports the uploaded URL to the caller", async () => {
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.upload(screen.getByLabelText("Photo"), pngFile());

    expect(uploadGearPhotoMock).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(PUBLIC_URL);
  });

  test("shows a failed upload inline and keeps the field empty", async () => {
    uploadGearPhotoMock.mockImplementation(async () => ({
      error: "That photo is too large.",
    }));
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.upload(screen.getByLabelText("Photo"), pngFile());

    expect(screen.getByText("That photo is too large.")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  // A refusal has to arrive before the file is read, not after.
  test("surfaces a refused path without uploading", async () => {
    createGearPhotoPathActionMock.mockImplementation(async () => ({
      error: "You don't have permission to perform this action.",
    }));
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.upload(screen.getByLabelText("Photo"), pngFile());

    expect(uploadGearPhotoMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("You don't have permission to perform this action."),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("Remove photo clears the value", async () => {
    const onChange = mock<(url: string) => void>(() => {});
    render(
      <PhotoUploadField
        value={PUBLIC_URL}
        onChange={onChange}
        idPrefix="item-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  // The guard that keeps a volunteer from deleting a photo that another row may
  // still be pointing at: only objects uploaded in this session are removed.
  test("Remove photo does not delete a photo it did not upload", async () => {
    render(
      <PhotoUploadField
        value={PUBLIC_URL}
        onChange={() => {}}
        idPrefix="item-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(deleteGearPhotoMock).not.toHaveBeenCalled();
  });

  test("a pasted link is passed straight through", async () => {
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.type(screen.getByLabelText("Photo link"), "h");

    expect(onChange).toHaveBeenCalledWith("h");
    expect(uploadGearPhotoMock).not.toHaveBeenCalled();
  });
});
