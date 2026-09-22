import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as DonationActions from "./actions";
import type { DonationActionResult } from "./actions";
import type { GivingSettingsInput } from "./actions";
import { DEFAULT_GIVING_SETTINGS, type GivingSettings } from "@/lib/giving";
import { labelText } from "../../../../../../test/labels";

const updateGivingSettingsActionMock = mock<
  (input: GivingSettingsInput) => Promise<DonationActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...DonationActions,
  updateGivingSettingsAction: updateGivingSettingsActionMock,
}));

const { GivingSettingsPanel } = await import("./giving-settings-panel");

const CONFIGURED: GivingSettings = {
  enabled: true,
  providerLabel: "Givebutter",
  url: "https://givebutter.com/example",
  mode: "link",
  suggestedAmounts: [25, 50],
  amountParam: "amount",
  recurringAvailable: false,
};

function save(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Save settings" }));
}

describe("GivingSettingsPanel", () => {
  beforeEach(() => {
    updateGivingSettingsActionMock.mockClear();
  });

  test("opens on what the tenant has stored", () => {
    render(<GivingSettingsPanel settings={CONFIGURED} />);

    expect(screen.getByLabelText(labelText("Giving page address"))).toHaveValue(
      "https://givebutter.com/example",
    );
    expect(screen.getByLabelText(labelText("Provider name"))).toHaveValue(
      "Givebutter",
    );
    expect(screen.getByLabelText(labelText("Suggested amounts"))).toHaveValue(
      "25, 50",
    );
  });

  test("sends the parsed amounts, not the text they were typed as", async () => {
    const user = userEvent.setup();
    render(<GivingSettingsPanel settings={CONFIGURED} />);

    const amounts = screen.getByLabelText(labelText("Suggested amounts"));
    await user.clear(amounts);
    await user.type(amounts, "$25, 50 100");
    await save(user);

    expect(updateGivingSettingsActionMock).toHaveBeenCalledTimes(1);
    expect(
      updateGivingSettingsActionMock.mock.calls[0][0].suggestedAmounts,
    ).toEqual([25, 50, 100]);
  });

  // The URL becomes an href on a public page. The panel says so in a sentence
  // rather than letting the RPC answer with a code.
  test("refuses an address the public site could not publish", async () => {
    const user = userEvent.setup();
    render(<GivingSettingsPanel settings={CONFIGURED} />);

    const url = screen.getByLabelText(labelText("Giving page address"));
    await user.clear(url);
    await user.type(url, "http://givebutter.com/example");
    await save(user);

    expect(updateGivingSettingsActionMock).not.toHaveBeenCalled();
    expect(screen.getByText(/must start with https/i)).toBeTruthy();
  });

  test("refuses to switch giving on with nothing to point at", async () => {
    const user = userEvent.setup();
    render(
      <GivingSettingsPanel
        settings={{ ...DEFAULT_GIVING_SETTINGS, enabled: false }}
      />,
    );

    await user.click(
      screen.getByRole("switch", { name: /show the give card/i }),
    );
    await save(user);

    expect(updateGivingSettingsActionMock).not.toHaveBeenCalled();
    expect(screen.getByText(/before switching giving on/i)).toBeTruthy();
  });

  // Amounts with no parameter to carry them are inert, and the panel says so
  // rather than showing a preview of buttons that would never render.
  test("says the amount buttons need the provider's parameter", async () => {
    const user = userEvent.setup();
    render(<GivingSettingsPanel settings={CONFIGURED} />);

    expect(screen.getByText(/\$25, \$50/)).toBeTruthy();

    const param = screen.getByLabelText(labelText("Amount parameter"));
    await user.clear(param);

    expect(
      screen.getByText(/Amount buttons need both an amount parameter/i),
    ).toBeTruthy();
  });

  test("keeps the tax sentence out of this panel entirely", () => {
    render(<GivingSettingsPanel settings={CONFIGURED} />);

    // No field for it: the only place it belongs is Site Content, and the
    // panel's job is to say where (docs/legal-basis.md rule 1).
    expect(screen.queryByLabelText(labelText("Tax note"))).toBeNull();
    expect(screen.getByText(/Site Content/)).toBeTruthy();
  });
});
