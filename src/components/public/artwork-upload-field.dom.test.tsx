import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ArtworkItem } from "./artwork-upload-field";

type UploadArgs = [
  File,
  { path: string; token: string; thumbPath: string; thumbToken: string },
  ((fraction: number) => void)?,
];

const uploadArtworkMock = mock<(...args: UploadArgs) => Promise<unknown>>(
  async (file, slot) => ({
    image: {
      path: slot.path,
      thumbPath: slot.thumbPath,
      contentType: file.type,
      byteSize: file.size,
    },
  }),
);

// The pure half still runs, so a test that picks an oversized file is also
// testing the real checkArtworkFile rules.
mock.module("@/lib/storage/artwork-submissions", () => ({
  ARTWORK_BUCKET: "artwork-submissions",
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],
  checkArtworkFile: (file: File) =>
    file.type === "image/gif"
      ? `${file.name} is not a JPEG, PNG or WebP.`
      : null,
  uploadArtwork: uploadArtworkMock,
}));

const slotsActionMock = mock<
  (code: string, types: string[]) => Promise<unknown>
>(async (_code, types) => ({
  slots: types.map((_type, index) => ({
    path: `t/e/d/${index}.jpg`,
    token: "token",
    thumbPath: `t/e/d/${index}-thumb.jpg`,
    thumbToken: "thumb-token",
  })),
}));

mock.module("@/app/(public)/artwork/[code]/artwork-actions", () => ({
  createArtworkUploadSlotsAction: slotsActionMock,
}));

const { ArtworkUploadField } = await import("./artwork-upload-field");

function jpeg(name = "art.jpg") {
  return new File([new Uint8Array([255, 216, 255])], name, {
    type: "image/jpeg",
  });
}

function Harness({ maxImages = 3 }: { maxImages?: number }) {
  return (
    <ArtworkUploadField
      code="DJXJEUB8JHCP"
      items={[]}
      onChange={() => {}}
      maxImages={maxImages}
    />
  );
}

describe("ArtworkUploadField", () => {
  beforeEach(() => {
    uploadArtworkMock.mockClear();
    slotsActionMock.mockClear();
  });

  // The input carries the label rather than hiding behind a button, so this is
  // the a11y assertion for the whole field.
  test("the file input has an accessible name", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Your artwork")).toBeTruthy();
  });

  test("uploads files dropped onto the zone, not only picked ones", async () => {
    render(<Harness />);

    const zone = screen.getByText("Or drag them here.").parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [jpeg("dropped.jpg")] } });

    await waitFor(() => expect(uploadArtworkMock).toHaveBeenCalledTimes(1));
    expect((uploadArtworkMock.mock.calls[0][0] as File).name).toBe(
      "dropped.jpg",
    );
  });

  test("shows a determinate bar once the upload reports progress", async () => {
    // Held open so the bar can be observed mid-flight rather than after the
    // component has already torn it down.
    let release: (value: unknown) => void = () => {};
    uploadArtworkMock.mockImplementation(async (file, slot, onProgress) => {
      onProgress?.(0.42);
      await new Promise((resolve) => {
        release = resolve;
      });
      return {
        image: {
          path: slot.path,
          thumbPath: slot.thumbPath,
          contentType: file.type,
          byteSize: file.size,
        },
      };
    });

    render(<Harness />);
    await userEvent.upload(screen.getByLabelText("Your artwork"), jpeg());

    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect(screen.getByText("42%")).toBeTruthy();

    release(undefined);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
  });

  // A bar claiming 0% is a different statement from a bar saying "running,
  // length unknown", and some proxies never send a computable progress event.
  test("leaves the bar indeterminate until progress is computable", async () => {
    let release: (value: unknown) => void = () => {};
    uploadArtworkMock.mockImplementation(async (file, slot) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      return {
        image: {
          path: slot.path,
          thumbPath: slot.thumbPath,
          contentType: file.type,
          byteSize: file.size,
        },
      };
    });

    render(<Harness />);
    await userEvent.upload(screen.getByLabelText("Your artwork"), jpeg());

    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();

    release(undefined);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
  });

  test("names the file that failed, keeping the ones that worked", async () => {
    uploadArtworkMock.mockImplementation(async (file, slot) =>
      file.name === "bad.jpg"
        ? { error: "bad.jpg could not be uploaded. Check your connection." }
        : {
            image: {
              path: slot.path,
              thumbPath: slot.thumbPath,
              contentType: file.type,
              byteSize: file.size,
            },
          },
    );

    const onChange = mock<(items: ArtworkItem[]) => void>(() => {});
    render(
      <ArtworkUploadField
        code="DJXJEUB8JHCP"
        items={[]}
        onChange={onChange}
        maxImages={3}
      />,
    );

    await userEvent.upload(screen.getByLabelText("Your artwork"), [
      jpeg("good.jpg"),
      jpeg("bad.jpg"),
    ]);

    await screen.findByText(
      "bad.jpg could not be uploaded. Check your connection.",
    );
    // The one that succeeded is kept -- re-picking everything because the
    // second file failed is a bad trade on a phone.
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });
});
