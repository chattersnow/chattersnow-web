import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

const UPLOADED =
  "http://127.0.0.1:54321/storage/v1/object/public/site-photos/tenant-1/logo-1.webp";

const uploadSitePhotoMock = mock<
  (
    file: File,
    path: string,
    format?: { type: string },
  ) => Promise<{ url: string; path: string } | { error: string }>
>(async (_file, path) => ({ url: UPLOADED, path }));

const sitePictureFormatMock = mock((kind: string) =>
  kind === "logo"
    ? { type: "image/webp", extension: "webp", maxEdge: 1024 }
    : { type: "image/jpeg", extension: "jpg", maxEdge: 2400 },
);

mock.module("@/lib/storage/site-photos", () => ({
  SITE_PHOTOS_BUCKET: "site-photos",
  SITE_LOGO_ACCEPT: "image/png,image/webp,image/jpeg,image/gif",
  sitePhotoPathFromUrl: () => null,
  uploadSitePhoto: uploadSitePhotoMock,
  sitePictureFormat: sitePictureFormatMock,
  deleteSitePhoto: async () => {},
}));

const createSitePhotoPathActionMock = mock<
  (extension?: string) => Promise<{ path: string } | { error: string }>
>(async (extension) => ({ path: `tenant-1/logo-1.${extension}` }));

mock.module("@/app/portal/(app)/website/site-photo-actions", () => ({
  createSitePhotoPathAction: createSitePhotoPathActionMock,
}));

const { LogoField } = await import("./logo-field");

function Controlled() {
  const [value, setValue] = useState("");
  return (
    <LogoField
      id="logo"
      uploadLabel="Upload a logo"
      label="Logo URL"
      ratio="4 / 1"
      value={value}
      onChange={setValue}
      description="Shown on the public sponsor wall."
    />
  );
}

describe("LogoField (#1488)", () => {
  beforeEach(() => {
    uploadSitePhotoMock.mockClear();
    sitePictureFormatMock.mockClear();
    createSitePhotoPathActionMock.mockClear();
  });

  test("the picker takes raster images, never SVG", () => {
    render(<Controlled />);
    const accept = screen
      .getByLabelText("Upload a logo")
      .getAttribute("accept");
    expect(accept).toContain("image/png");
    expect(accept).not.toContain("svg");
    expect(accept).not.toBe("image/*");
  });

  test("an upload is encoded as a logo, so it keeps its transparency", async () => {
    const user = userEvent.setup();
    const { container } = render(<Controlled />);

    await user.upload(
      screen.getByLabelText("Upload a logo"),
      new File([new Uint8Array([137, 80, 78, 71])], "logo.png", {
        type: "image/png",
      }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Logo URL")).toHaveValue(UPLOADED),
    );
    expect(sitePictureFormatMock).toHaveBeenCalledWith("logo");
    expect(createSitePhotoPathActionMock).toHaveBeenCalledWith("webp");
    expect(uploadSitePhotoMock.mock.calls[0]?.[2]?.type).toBe("image/webp");

    // On a light and a dark background, which is what shows whether the
    // transparent corners survived.
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image.getAttribute("src")).toBe(UPLOADED);
    }
  });
});
