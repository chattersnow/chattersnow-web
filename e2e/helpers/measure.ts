import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Measuring a surface that may still be moving (#1380).
 *
 * Playwright's "visible" is true from an element's first frame, so a
 * `boundingBox()` taken on the line after `expect(...).toBeVisible()` can
 * measure a sheet that is still sliding in, and the number it returns is then
 * compared against a threshold as though it were final. A tap target read
 * mid-flight reads short; a position read mid-flight is the position the
 * element is leaving.
 *
 * `portal-mobile-shell.spec.ts` already documented this for one sheet and
 * polled there; these are the same two moves, in one place, so the next
 * measurement does not have to rediscover them.
 */

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Waits for the transitions and keyframe animations on an element and its
 * ancestors to finish.
 *
 * Ancestors matter more than the element itself here: a close button inside a
 * sheet has no animation of its own, and every pixel it travels comes from the
 * sheet's `translate-y` transition. Infinite animations -- a spinner, a
 * pulsing skeleton -- are skipped, since their `finished` promise never
 * settles.
 *
 * Never throws, and never waits longer than `budget`. An animation cancelled
 * while it is awaited rejects, and one whose `finished` promise never settles
 * would otherwise spend the whole test timeout here -- neither is a reason to
 * fail a measurement, and `stable` below is the backstop for both.
 */
export async function settled(locator: Locator, budget = 2_000): Promise<void> {
  await locator
    .evaluate(
      (element, ms) =>
        Promise.race([
          (() => {
            const running: Animation[] = [];
            for (
              let node: Element | null = element;
              node;
              node = node.parentElement
            ) {
              running.push(...node.getAnimations());
            }
            return Promise.all(
              running
                .filter(
                  (animation) =>
                    animation.effect?.getComputedTiming().iterations !==
                    Infinity,
                )
                .map((animation) => animation.finished),
            );
          })(),
          new Promise((resolve) => setTimeout(resolve, ms)),
        ]),
      budget,
    )
    .catch(() => {});
}

/**
 * Polls `read` until it answers with the same value twice running, and returns
 * that value.
 *
 * The backstop for the movement the Web Animations API does not describe: a
 * layout that settles once a font or an image lands, or a scroll container
 * coming to rest. Equality is by `JSON.stringify`, which is enough for the
 * boxes and the transform strings this is used on.
 */
export async function stable<T>(
  read: () => Promise<T>,
  what: string,
): Promise<T> {
  let previous: { value: T } | null = null;
  await expect
    .poll(
      async () => {
        const value = await read();
        const agrees =
          previous !== null &&
          JSON.stringify(previous.value) === JSON.stringify(value);
        previous = { value };
        return agrees;
      },
      { message: `${what} never stopped changing` },
    )
    .toBe(true);
  return previous!.value;
}

/**
 * An element's box, read only once it is visible and has stopped moving.
 *
 * The `toBeVisible` is part of the contract rather than a nicety: it is the
 * positive anchor that stops the measurement being taken against an element
 * that has not been laid out, which `(await x.boundingBox())!` turns into a
 * `TypeError` and `box?.width ?? 0` turns into a silent zero.
 */
export async function settledBox(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  await settled(locator);
  const box = await stable(
    () => locator.boundingBox(),
    `the box of ${locator}`,
  );
  expect(box, `${locator} is visible but has no box to measure`).not.toBeNull();
  return box!;
}

/**
 * The computed `transform` of the element `selector` matches, once it has come
 * to rest.
 *
 * For a carousel track and anything else moved by a transform rather than by
 * a class or an attribute: the string is the position itself, so comparing two
 * of them says whether the thing moved without deriving an index from
 * geometry that is only meaningful once the move is over.
 */
export async function settledTransform(
  page: Page,
  selector: string,
): Promise<string> {
  await settled(page.locator(selector).first());
  return stable(
    () =>
      page.evaluate((css) => {
        const element = document.querySelector(css);
        if (!element) return "";
        return getComputedStyle(element).transform;
      }, selector),
    `the transform of ${selector}`,
  );
}
