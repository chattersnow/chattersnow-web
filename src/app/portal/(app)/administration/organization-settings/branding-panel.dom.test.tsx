import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../../test/toast-testing";
import {
  DEFAULT_TYPOGRAPHY,
  TYPOGRAPHY_SETS,
  brandingFromRows,
  type Branding,
} from "@/lib/branding";
import * as SettingsActions from "./actions";

const saveMock = mock(async (_formData: FormData) => ({ success: true }));

mock.module("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
mock.module("./actions", () => ({
  ...SettingsActions,
  updateBrandingAction: saveMock,
}));

const { BrandingPanel } = await import("./branding-panel");

/** What `updateBrandingAction` was last handed for the typography token. */
function savedTypography(): FormDataEntryValue | null {
  return saveMock.mock.calls.at(-1)?.[0].get("typography") ?? null;
}

function renderPanel(branding: Branding) {
  renderWithToaster(<BrandingPanel branding={branding} />);
}

function option(name: string | RegExp): HTMLInputElement {
  return screen.getByRole("radio", { name }) as HTMLInputElement;
}

describe("BrandingPanel typography (#1261)", () => {
  beforeEach(() => {
    saveMock.mockClear();
  });

  test("offers every set plus the platform default, each in its own type", () => {
    renderPanel(brandingFromRows([]));

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(TYPOGRAPHY_SETS.length + 1);

    for (const set of TYPOGRAPHY_SETS) {
      // The label is drawn in the set's own display face rather than in the
      // page's: an option list all set in one typeface says nothing about the
      // only thing being chosen here.
      const label = screen.getByText(set.label);
      expect(label.style.fontFamily).toBe(`var(${set.heading.cssVar})`);
      expect(label.style.letterSpacing).toBe(set.headingTracking);
      expect(screen.getByText(set.description).style.fontFamily).toBe(
        `var(${set.sans.cssVar})`,
      );
      if (set.accent) {
        // `getAllByText`: two sets share Caveat, and each names it in itself.
        const accent = set.accent;
        for (const sample of screen.getAllByText(accent.name)) {
          expect(sample.style.fontFamily).toBe(`var(${accent.cssVar})`);
        }
      }
    }
  });

  test("a stored set is the one selected", () => {
    renderPanel(
      brandingFromRows([{ token: "typography", value: "editorial" }]),
    );

    expect(option(/Editorial/).checked).toBe(true);
    expect(option(/Platform default/).checked).toBe(false);
  });

  test("an unknown stored set shows as the platform default", () => {
    // The registry is what the tenant's pages render through, so a row naming
    // a set the platform no longer offers is already the default everywhere
    // else. The picker has to agree, rather than showing nothing chosen and
    // inviting an administrator to "fix" a page that is not broken.
    const branding = brandingFromRows([
      { token: "typography", value: "comic-sans" },
    ]);
    expect(branding.typography).toBeNull();

    renderPanel(branding);

    expect(option(/Platform default/).checked).toBe(true);
    expect(
      screen.getAllByRole("radio").filter((radio) => radio.ariaChecked),
    ).toHaveLength(0);
  });

  test("the platform default is drawn in the platform's own families", () => {
    renderPanel(brandingFromRows([]));

    const label = screen.getByText("Platform default");
    expect(label.style.fontFamily).toBe(
      `var(${DEFAULT_TYPOGRAPHY.heading.cssVar})`,
    );
  });

  test("picking a set saves its key, and Reset clears it", async () => {
    const user = userEvent.setup();
    renderPanel(brandingFromRows([{ token: "typography", value: "rounded" }]));

    await user.click(option(/Statement/));
    await user.click(screen.getByRole("button", { name: /Save branding/ }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(savedTypography()).toBe("statement");

    await user.click(screen.getByRole("button", { name: /Reset to defaults/ }));
    expect(option(/Platform default/).checked).toBe(true);

    await user.click(screen.getByRole("button", { name: /Save branding/ }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    // Empty, not absent: `app_settings` has no delete grant, so "no choice of
    // my own" is written as a blank value the readers treat as unset.
    expect(savedTypography()).toBe("");
  });
});
