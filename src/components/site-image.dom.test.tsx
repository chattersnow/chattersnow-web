import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import type { CSSProperties } from "react";

// next/image parses `src` through `new URL()` at render, which happy-dom
// refuses -- the house workaround. This stand-in forwards everything these
// tests assert on: the src actually requested, the sizes hint, and the
// object-position that carries the crop's centre.
mock.module("next/image", () => ({
  default: ({
    src,
    alt,
    sizes,
    className,
    style,
  }: {
    src: unknown;
    alt: string;
    sizes?: string;
    className?: string;
    style?: CSSProperties;
  }) => (
    <img
      src={typeof src === "string" ? src : ""}
      alt={alt}
      data-sizes={sizes}
      className={className}
      style={style}
    />
  ),
}));

const { SiteImage } = await import("./site-image");

const PHOTO = "https://drive.google.com/thumbnail?id=ABC123&sz=w1000";
const CROPPED = `${PHOTO}#crop=0.1800,0.2600,0.6400,0.4288`;

function image(container: HTMLElement): HTMLImageElement {
  const found = container.querySelector("img");
  expect(found).not.toBeNull();
  return found as HTMLImageElement;
}

describe("SiteImage without a crop", () => {
  // ~20 public pages render this component, and the team and portrait tests
  // depend on its DOM. An uncropped photo must be exactly what it always was.
  test("renders today's DOM: one frame, object-cover, no inner box", () => {
    const { container } = render(
      <SiteImage url={PHOTO} alt="A rider" sizes="50vw" />,
    );

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("relative");
    expect(frame.className).toContain("aspect-square");
    expect(frame.querySelectorAll("div")).toHaveLength(0);

    const img = image(container);
    expect(img.getAttribute("src")).toBe(PHOTO);
    expect(img.className).toBe("object-cover");
    expect(img.getAttribute("data-sizes")).toBe("50vw");
    expect(img.style.objectPosition).toBe("");
  });

  test("falls back to the placeholder when no photo is set", () => {
    const { container } = render(
      <SiteImage url={null} alt="A rider" className="aspect-[4/3]" />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "aspect-[4/3]",
    );
  });

  // A fragment we cannot parse is not a crop, so nothing changes -- except that
  // it stays on the src, where somebody can see it and fix it.
  test("ignores a fragment that is not a valid crop", () => {
    const url = `${PHOTO}#crop=garbage`;
    const { container } = render(<SiteImage url={url} alt="A rider" />);

    expect(image(container).getAttribute("src")).toBe(url);
    expect(container.querySelectorAll("div")).toHaveLength(1);
  });
});

describe("SiteImage with a crop", () => {
  test("lays the image out in a box that puts the rect on the frame", () => {
    const { container } = render(
      <SiteImage
        url={CROPPED}
        alt="A rider"
        sizes="(min-width: 768px) 160px, 96px"
      />,
    );

    const frame = container.firstElementChild as HTMLElement;
    const box = frame.firstElementChild as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.className).toContain("absolute");
    expect(box.style.left).toBe("-28.125%");
    expect(box.style.top).toBe("-60.6343%");
    expect(box.style.width).toBe("156.25%");
    expect(box.style.height).toBe("233.209%");
  });

  test("pins the rect's centre with object-position", () => {
    const { container } = render(<SiteImage url={CROPPED} alt="A rider" />);

    expect(image(container).style.objectPosition).toBe("50% 47.44%");
  });

  test("strips the fragment off the src and asks Drive for more pixels", () => {
    const { container } = render(<SiteImage url={CROPPED} alt="A rider" />);

    expect(image(container).getAttribute("src")).toBe(
      "https://drive.google.com/thumbnail?id=ABC123&sz=w1600",
    );
  });

  // The element is laid out 1/w wider than the frame, so the frame's own sizes
  // would under-request and the browser would upscale.
  test("widens sizes by 1/w", () => {
    const { container } = render(
      <SiteImage
        url={CROPPED}
        alt="A rider"
        sizes="(min-width: 768px) 160px, 96px"
      />,
    );

    expect(image(container).getAttribute("data-sizes")).toBe(
      "(min-width: 768px) 250px, 150px",
    );
  });

  test("still merges the caller's aspect onto the outer frame", () => {
    const { container } = render(
      <SiteImage url={CROPPED} alt="A rider" className="aspect-[4/3]" />,
    );

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("aspect-[4/3]");
    expect(frame.className).toContain("overflow-hidden");
  });
});
