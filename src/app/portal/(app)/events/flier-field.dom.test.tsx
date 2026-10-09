import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

const UPLOADED =
  "http://127.0.0.1:54321/storage/v1/object/public/site-photos/tenant-1/flier-1.jpg";

const uploadSitePhotoMock = mock<
  (
    file: File,
    path: string,
  ) => Promise<{ url: string; path: string } | { error: string }>
>(async (_file, path) => ({ url: UPLOADED, path }));

mock.module("@/lib/storage/site-photos", () => ({
  SITE_PHOTOS_BUCKET: "site-photos",
  SITE_PHOTO_MAX_EDGE: 2400,
  sitePhotoPathFromUrl: () => null,
  uploadSitePhoto: uploadSitePhotoMock,
  sitePictureFormat: () => ({
    type: "image/jpeg",
    extension: "jpg",
    maxEdge: 2400,
  }),
  deleteSitePhoto: async () => {},
}));

const createSitePhotoPathActionMock = mock<
  (extension?: string) => Promise<{ path: string } | { error: string }>
>(async () => ({ path: "tenant-1/flier-1.jpg" }));

mock.module("@/app/portal/(app)/website/site-photo-actions", () => ({
  createSitePhotoPathAction: createSitePhotoPathActionMock,
}));

const { FlierField, FlierPreview } = await import("./flier-field");

function Controlled({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FlierField id="flier" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

function jpegFile() {
  return new File([new Uint8Array([255, 216, 255])], "flier.jpg", {
    type: "image/jpeg",
  });
}

describe("FlierField (#1487)", () => {
  beforeEach(() => {
    uploadSitePhotoMock.mockClear();
    createSitePhotoPathActionMock.mockClear();
  });

  test("offers an upload beside the link box", () => {
    render(<Controlled />);
    expect(screen.getByLabelText("Upload a flier")).toHaveAttribute(
      "type",
      "file",
    );
    expect(screen.getByLabelText("Flier image URL")).toHaveAttribute(
      "type",
      "url",
    );
  });

  test("an uploaded flier is stored as the link and previewed", async () => {
    const user = userEvent.setup();
    const { container } = render(<Controlled />);

    await user.upload(screen.getByLabelText("Upload a flier"), jpegFile());

    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent(UPLOADED),
    );
    // A flier is a photo, not a logo: JPEG is right.
    expect(createSitePhotoPathActionMock).toHaveBeenCalledWith("jpg");
    expect(screen.getByLabelText("Flier image URL")).toHaveValue(UPLOADED);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(UPLOADED);
  });

  test("a refused upload says why and keeps the flier as it was", async () => {
    createSitePhotoPathActionMock.mockImplementationOnce(async () => ({
      error: "You don't have permission to upload pictures here.",
    }));
    const user = userEvent.setup();
    render(<Controlled initial="https://example.org/old.png" />);

    await user.upload(screen.getByLabelText("Upload a flier"), jpegFile());

    expect(
      await screen.findByText(
        "You don't have permission to upload pictures here.",
      ),
    ).toBeInTheDocument();
    expect(uploadSitePhotoMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("value")).toHaveTextContent(
      "https://example.org/old.png",
    );
  });

  test("a link that does not load as a picture says so", () => {
    const { container } = render(
      <Controlled initial="https://drive.google.com/file/d/ABC123/view" />,
    );

    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText(/did not load as a picture/)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("FlierPreview (#1487)", () => {
  // The read-only Overview printed the link as text, so nobody could tell
  // whether the flier loaded without opening the public page.
  test("shows the flier as a picture rather than a link", () => {
    const { container } = render(
      <FlierPreview url="https://drive.google.com/file/d/ABC123/view" />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://drive.google.com/thumbnail?id=ABC123&sz=w1000",
    );
    expect(
      screen.getByRole("link", { name: /Open the full picture/ }),
    ).toBeInTheDocument();
  });

  test("shows a dash when there is no flier", () => {
    const { container } = render(<FlierPreview url="" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("—");
  });
});
