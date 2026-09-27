import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DistributionDraft } from "@/lib/inventory-distribution-draft";

const ITEM = {
  id: "item-1",
  description: "Burton Custom",
  size: "154",
  status: "available",
  intendedUse: "gear_library",
  heldBy: null,
  numberedCode: null,
};
const RECIPIENT = {
  id: "person-1",
  name: "Jordan Rider",
  email: "jordan@example.org",
  phone: null,
};

let storedDraft: DistributionDraft | null = null;

const addToDistributionDraftActionMock = mock(
  async (itemId: string, eventId: string | null) => {
    storedDraft = {
      eventId,
      eventName: eventId ? "Spring Swap" : null,
      recipient: storedDraft?.recipient ?? null,
      updatedAt: new Date().toISOString(),
      items: [{ ...ITEM, id: itemId }],
    };
    return { success: true as const };
  },
);
const setDistributionDraftRecipientActionMock = mock(async () => ({
  success: true as const,
}));

mock.module("../../../home/distribution-draft-actions", () => ({
  addToDistributionDraftAction: addToDistributionDraftActionMock,
  getDistributionDraftAction: async () => ({ data: storedDraft }),
  setDistributionDraftRecipientAction: setDistributionDraftRecipientActionMock,
  moveDistributionDraftAction: async () => ({ success: true }),
  discardDistributionDraftAction: async () => ({ success: true }),
  recordDistributionDraftAction: async () => ({ count: 1 }),
  removeFromDistributionDraftAction: async () => ({ success: true }),
  lookupScannedItemsAction: async () => ({ data: [] }),
}));

mock.module("../../../home/distribution-actions", () => ({
  listAvailableInventoryItemsAction: async () => ({
    data: [{ id: "item-2", description: "Smith goggles", type: null }],
  }),
  recordEventDistributionAction: async () => ({ success: true }),
}));

const PeopleActions = await import("../../../people/actions");
mock.module("../../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: async () => ({ data: [RECIPIENT] }),
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/portal/inventory/items/item-1",
  useSearchParams: () => new URLSearchParams(),
}));

const { DistributeButton, distributeLabel } =
  await import("./distribute-button");

beforeEach(() => {
  storedDraft = null;
  addToDistributionDraftActionMock.mockClear();
  setDistributionDraftRecipientActionMock.mockClear();
});

describe("distributeLabel", () => {
  test("names the list in progress, and whom it is for", () => {
    expect(distributeLabel(null)).toBe("Distribute");
    expect(
      distributeLabel({
        eventId: null,
        itemCount: 2,
        recipientName: "Jordan Rider",
        includesItem: false,
      }),
    ).toBe("Add to current distribution (2 items, for Jordan Rider)");
    expect(
      distributeLabel({
        eventId: null,
        itemCount: 1,
        recipientName: null,
        includesItem: true,
      }),
    ).toBe("Open current distribution (1 item)");
  });
});

describe("DistributeButton", () => {
  test("puts the item on a list at the active event and opens it in scan mode", async () => {
    const user = userEvent.setup();
    render(
      <DistributeButton
        itemId="item-1"
        current={null}
        defaultEventId="event-1"
        eventOptions={[{ id: "event-1", name: "Spring Swap" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Distribute" }));

    expect(addToDistributionDraftActionMock).toHaveBeenCalledWith(
      "item-1",
      "event-1",
    );
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Burton Custom (154)")).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Record 1 item" }),
    ).toBeTruthy();
    expect(within(dialog).getByLabelText("Event")).toBeTruthy();
    expect(within(dialog).getByText("Spring Swap")).toBeTruthy();
    expect(
      within(dialog).getByLabelText("Add an item without a label"),
    ).toBeTruthy();
  });

  test("a list in progress comes back with its recipient", async () => {
    storedDraft = {
      eventId: null,
      eventName: null,
      recipient: RECIPIENT,
      updatedAt: new Date().toISOString(),
      items: [{ ...ITEM, id: "item-9", description: "Helmet", size: null }],
    };
    const user = userEvent.setup();
    render(
      <DistributeButton
        itemId="item-1"
        current={{
          eventId: null,
          itemCount: 1,
          recipientName: RECIPIENT.name,
          includesItem: false,
        }}
        defaultEventId="event-1"
        eventOptions={[{ id: "event-1", name: "Spring Swap" }]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add to current distribution (1 item, for Jordan Rider)",
      }),
    );

    // Added to the list in progress (no event), not a new one at the event.
    expect(addToDistributionDraftActionMock).toHaveBeenCalledWith(
      "item-1",
      null,
    );
    const dialog = await screen.findByRole("dialog");
    // The picker shows the stored recipient as its chip.
    await waitFor(() =>
      expect(within(dialog).getByText("jordan@example.org")).toBeTruthy(),
    );
  });
});
