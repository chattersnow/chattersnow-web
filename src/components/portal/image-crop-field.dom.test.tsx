import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageCropField } from "./image-crop-field";

const PHOTO = "https://example.test/hero.jpg";

/**
 * The control as its callers use it: every gesture emits a whole stored string
 * and the caller puts it straight back in, so what the frame draws next is
 * always what was just emitted. Testing it any other way would test a crop
 * control no one has.
 */
function renderField({
  url = PHOTO,
  ratio = "1/1",
}: { url?: string; ratio?: string } = {}) {
  const emitted: string[] = [];

  function Harness() {
    const [value, setValue] = useState(url);
    return (
      <ImageCropField
        url={value}
        ratio={ratio}
        label="the hero photo"
        onChange={(next) => {
          emitted.push(next);
          setValue(next);
        }}
      />
    );
  }

  render(<Harness />);
  return {
    emitted,
    last: () => emitted.at(-1),
    zoom: () => screen.getByRole("slider", { name: "Zoom" }),
    across: () => screen.getByRole("slider", { name: "Horizontal position" }),
    down: () => screen.getByRole("slider", { name: "Vertical position" }),
    /** The box the picture is laid out in, which carries the crop as inline style. */
    box: () => document.querySelector("img")?.parentElement ?? null,
    set(slider: HTMLElement, value: number) {
      fireEvent.change(slider, { target: { value: String(value) } });
    },
    /**
     * A load with a real intrinsic size. `happy-dom` reports 0x0 for every
     * image, and the rect the control computes is an aspect against that size,
     * so the picture's shape has to be declared rather than drawn.
     */
    async load(width: number, height: number) {
      const img = document.querySelector("img")!;
      Object.defineProperty(img, "naturalWidth", {
        value: width,
        configurable: true,
      });
      Object.defineProperty(img, "naturalHeight", {
        value: height,
        configurable: true,
      });
      fireEvent.load(img);
      await waitFor(() =>
        expect(screen.getByRole("slider", { name: "Zoom" })).toBeEnabled(),
      );
    },
  };
}

/** The crop on an emitted value, as four numbers. */
function crop(value: string | undefined): number[] {
  const fragment = value?.split("#crop=")[1];
  return fragment ? fragment.split(",").map(Number) : [];
}

describe("ImageCropField", () => {
  test("offers zoom and both axes as sliders", async () => {
    const field = renderField();
    await field.load(1600, 900);

    // Three native ranges rather than a drag surface with key handling of its
    // own: the picture can be framed from the keyboard, and the pointer path
    // below is sugar over the same three values (#1251).
    expect(field.zoom()).toHaveAttribute("aria-valuetext", "1×");
    expect(field.across()).toBeInTheDocument();
    expect(field.down()).toBeInTheDocument();
  });

  test("switches off the axis with nowhere to go", async () => {
    const field = renderField();
    await field.load(1600, 900);

    // A 16:9 photo in a square frame is already as tall as the frame, so at
    // zoom 1 it can only slide sideways. One axis always has no slack there.
    expect(field.across()).toBeEnabled();
    expect(field.down()).toBeDisabled();
  });

  test("zooms about the same centre, at the frame's own aspect", async () => {
    const field = renderField();
    await field.load(1600, 900);

    field.set(field.zoom(), 200);

    const [x, y, w, h] = crop(field.last());
    // Half as wide and half as tall as the rect that fills the frame, and
    // still square once measured in the photo's own pixels.
    expect((w * 1600) / (h * 900)).toBeCloseTo(1, 2);
    expect(x + w / 2).toBeCloseTo(0.5, 2);
    expect(y + h / 2).toBeCloseTo(0.5, 2);
    expect(field.zoom()).toHaveAttribute("aria-valuetext", "2×");
  });

  test("moves one axis at a time and stops at the edge", async () => {
    const field = renderField();
    await field.load(1600, 900);

    field.set(field.across(), 100);

    const [x, y, w, h] = crop(field.last());
    // Hard against the right edge rather than past it: the rect is clamped
    // inside the photo, never a window onto nothing.
    expect(x + w).toBeCloseTo(1, 4);
    expect(y).toBe(0);
    expect(h).toBe(1);
    expect(field.across()).toHaveAttribute("aria-valuetext", "100%");

    field.set(field.across(), 0);
    expect(crop(field.last())[0]).toBe(0);
  });

  test("draws the crop it is about to store", async () => {
    const field = renderField();
    await field.load(1600, 900);

    field.set(field.across(), 100);

    // The box is `1/w` of the frame, shifted back by the rect's own offset --
    // the same arithmetic `SiteImage` lays the public page out with, so the
    // frame here is the page's crop and not an approximation of it.
    const [x, , w] = crop(field.last());
    expect(field.box()?.style.width).toBe(`${(100 / w).toFixed(4)}%`);
    expect(field.box()?.style.left).toBe(`${((-100 * x) / w).toFixed(4)}%`);
  });

  test("resets to the photo with no crop on it", async () => {
    const field = renderField({
      url: `${PHOTO}#crop=0.2000,0.0000,0.5000,1.0000`,
    });
    await field.load(1600, 900);

    await userEvent.click(screen.getByRole("button", { name: "Reset crop" }));

    // The bare link, not an identity rect: "never cropped" and "reset" have to
    // be the same string or the editor reads as dirty for ever.
    expect(field.last()).toBe(PHOTO);
  });

  test("survives a picture whose size the browser has not reported", () => {
    const field = renderField({
      url: `${PHOTO}#crop=0.2000,0.0000,0.5000,1.0000`,
    });

    // No load fired, so `naturalWidth` is 0. Every number the rect is built
    // from divides by that size somewhere, and a NaN in an inline style takes
    // the whole picture off the screen.
    expect(field.box()?.getAttribute("style")).not.toContain("NaN");

    field.set(field.zoom(), 200);

    expect(field.last()).not.toContain("NaN");
    expect(crop(field.last()).every(Number.isFinite)).toBe(true);
  });
});
