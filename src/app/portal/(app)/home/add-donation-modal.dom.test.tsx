import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateDonationInput } from "./donation-form";
import * as HomeActions from "./actions";
import { labelText } from "../../../../../test/labels";

type CreateDonationResult = HomeActions.CreateDonationResult & {
  labelsHref?: string | null;
};

const SAVED: CreateDonationResult = {
  success: true,
  donationId: "donation-1",
  codes: [{ itemId: "item-1", code: "K7M2QX" }],
  giveaway: null,
  labelsHref: "/portal/inventory/donations/labels?donation=donation-1",
};

const createDonationActionMock = mock<
  (input: CreateDonationInput) => Promise<CreateDonationResult>
>(async () => SAVED);

const classifyIntakeScanActionMock = mock<
  (
    scanned: string,
  ) => Promise<
    { data: import("./intake-scan-actions").IntakeScan } | { error: string }
  >
>(async () => ({ error: "unset" }));

mock.module("./intake-scan-actions", () => ({
  classifyIntakeScanAction: classifyIntakeScanActionMock,
}));

// Events without a tiered giveaway return no tiers, which is the default the
// existing cases exercise -- the per-item tier picker stays hidden.
const listEventGiveawayTiersActionMock = mock<
  (eventId: string) => Promise<{ data: HomeActions.GiveawayTierOption[] }>
>(async () => ({ data: [] }));

mock.module("./actions", () => ({
  ...HomeActions,
  createDonationAction: createDonationActionMock,
  listEventGiveawayTiersAction: listEventGiveawayTiersActionMock,
}));

// The photo field (#781) reaches Supabase Storage and a Server Action, neither
// of which exists under happy-dom. next/image builds a real URL from the src at
// render, which happy-dom refuses.
mock.module("next/image", () => ({ default: () => null }));

const GEAR_PHOTO_URL =
  "http://127.0.0.1:54321/storage/v1/object/public/gear-photos/tenant-1/photo-2.jpg";

mock.module("@/lib/storage/gear-photos", () => ({
  GEAR_PHOTOS_BUCKET: "gear-photos",
  gearPhotoPathFromUrl: () => null,
  uploadGearPhoto: async (_file: File, path: string) => ({
    url: GEAR_PHOTO_URL,
    path,
  }),
  deleteGearPhoto: async () => {},
}));

mock.module("@/app/portal/(app)/gear-photo-actions", () => ({
  createGearPhotoPathAction: async () => ({ path: "tenant-1/photo-2.jpg" }),
}));

// The sheet loads event options on open whenever a caller passes neither an
// events list nor a fixed eventId.
mock.module("../events/actions", () => ({
  listEventOptionsAction: async () => ({ data: [] }),
}));

// The item category vocabulary (issue #667), also loaded on open.
mock.module("../inventory/categories/actions", () => ({
  listInventoryCategoriesAction: async () => ({
    data: [
      {
        id: "category-jacket",
        key: "jacket",
        label: "Jacket",
        groupKey: "outerwear",
        groupLabel: "Outerwear",
        isActive: true,
      },
      {
        id: "category-other",
        key: "other",
        label: "Other",
        groupKey: "other",
        groupLabel: "Other",
        isActive: true,
      },
    ],
  }),
}));

const { AddDonationModal } = await import("./add-donation-modal");

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  render(<AddDonationModal />);
  await user.click(screen.getByRole("button", { name: "Record donation" }));
}

async function selectItemCategory(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByLabelText(labelText("Item category")));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: label }));
}

async function selectSourceType(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByLabelText("Donor source"));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByText(label));
}

async function fillDonorAndContinue(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.type(screen.getByLabelText(labelText("Donor name")), name);
  await selectSourceType(user, "Individual");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

describe("AddDonationModal", () => {
  beforeEach(() => {
    createDonationActionMock.mockClear();
    createDonationActionMock.mockImplementation(async () => SAVED);
    classifyIntakeScanActionMock.mockClear();
    listEventGiveawayTiersActionMock.mockClear();
    listEventGiveawayTiersActionMock.mockImplementation(async () => ({
      data: [],
    }));
  });

  test("blocks continuing without a donor name", async () => {
    const user = userEvent.setup();
    await openModal(user);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText(
        "Donor name is required unless the donation is anonymous.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Step 2 of 2/)).not.toBeInTheDocument();
  });

  test("allows an empty donor name when anonymous", async () => {
    const user = userEvent.setup();
    await openModal(user);

    await user.click(screen.getByRole("checkbox", { name: "Anonymous donor" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.queryByText(
        "Donor name is required unless the donation is anonymous.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Select a donor source.")).toBeInTheDocument();
  });

  test("blocks continuing without a donor source", async () => {
    const user = userEvent.setup();
    await openModal(user);

    await user.type(
      screen.getByLabelText(labelText("Donor name")),
      "Jane Donor",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Select a donor source.")).toBeInTheDocument();
  });

  test("advances to the items step once donor details are valid", async () => {
    const user = userEvent.setup();
    await openModal(user);

    await fillDonorAndContinue(user, "Jane Donor");

    expect(screen.getByText("Step 2 of 2 · Donated items")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
  });

  test("adding and removing items keeps at least one item", async () => {
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");

    expect(screen.getAllByRole("button", { name: "Remove" })[0]).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "+ Add another item" }),
    );
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons[0]).not.toBeDisabled();

    await user.click(removeButtons[0]);
    expect(screen.queryByText("Item 2")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  test("submits the donation and maps blank optional item fields to undefined", async () => {
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");

    await user.type(
      screen.getByLabelText(labelText("Item description")),
      "Winter jacket",
    );
    await selectItemCategory(user, "Jacket");
    await user.click(screen.getByRole("button", { name: "Save donation" }));

    await screen.findByText("Donation recorded");
    expect(createDonationActionMock).toHaveBeenCalledTimes(1);

    const payload = createDonationActionMock.mock.calls[0][0];
    expect(payload.donorName).toBe("Jane Donor");
    expect(payload.sourceType).toBe("individual");
    expect(payload.items).toEqual([
      {
        description: "Winter jacket",
        size: undefined,
        categoryKey: "jacket",
        categoryDetail: undefined,
        gender: undefined,
        condition: "",
        faceValue: null,
        notes: undefined,
        intendedUse: "gear_library",
      },
    ]);
  });

  // Keyed on the item, not on its index: every id in an item card is suffixed
  // with `item.key`, and a photo landing on the wrong draft is exactly what an
  // index-keyed update would produce.
  test("attaches a photo to the item it was added to", async () => {
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");

    await user.type(
      screen.getByLabelText(labelText("Item description")),
      "Jacket",
    );
    await selectItemCategory(user, "Jacket");
    await user.click(
      screen.getByRole("button", { name: "+ Add another item" }),
    );

    const descriptions = screen.getAllByLabelText(
      labelText("Item description"),
    );
    await user.type(descriptions[1], "Helmet");
    await user.upload(
      screen.getAllByLabelText("Photo")[1],
      new File([new Uint8Array([137, 80, 78, 71])], "gear.png", {
        type: "image/png",
      }),
    );
    await screen.findByRole("button", { name: "Remove photo" });

    await user.click(screen.getByRole("button", { name: "Save donation" }));
    await screen.findByText("Donation recorded");

    const payload = createDonationActionMock.mock.calls[0][0];
    expect(payload.items[0].photoUrl).toBeUndefined();
    expect(payload.items[1].photoUrl).toBe(GEAR_PHOTO_URL);
  });

  test("shows the server error and stays open on failure", async () => {
    createDonationActionMock.mockImplementation(async () => ({
      error: {
        code: "server_error" as const,
        message: "Could not save the donation. Please try again.",
      },
    }));
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");

    await user.type(
      screen.getByLabelText(labelText("Item description")),
      "Winter jacket",
    );
    await selectItemCategory(user, "Jacket");
    await user.click(screen.getByRole("button", { name: "Save donation" }));

    expect(
      await screen.findByText("Could not save the donation. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 2 · Donated items")).toBeInTheDocument();
  });

  test("hides the source event picker when no events are provided", async () => {
    const user = userEvent.setup();
    await openModal(user);

    expect(screen.queryByLabelText(labelText("Source event"))).toBeNull();
  });

  test("hides the source event picker when a fixed eventId is given", async () => {
    const user = userEvent.setup();
    render(
      <AddDonationModal
        eventId="event-1"
        events={[{ id: "event-1", name: "Winter Gear Drive" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Record donation" }));

    expect(screen.queryByLabelText(labelText("Source event"))).toBeNull();
  });

  test("submits the selected source event when no fixed eventId is given", async () => {
    const user = userEvent.setup();
    render(
      <AddDonationModal
        events={[
          { id: "event-1", name: "Winter Gear Drive" },
          { id: "event-2", name: "Spring Cleanup" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Record donation" }));
    await fillDonorAndContinue(user, "Jane Donor");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByLabelText(labelText("Source event")));
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByText("Spring Cleanup"));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.type(
      screen.getByLabelText(labelText("Item description")),
      "Winter jacket",
    );
    await selectItemCategory(user, "Jacket");
    await user.click(screen.getByRole("button", { name: "Save donation" }));

    await screen.findByText("Donation recorded");
    const payload = createDonationActionMock.mock.calls[0][0];
    expect(payload.eventId).toBe("event-2");
  });

  test("the confirmation lists each item's code and offers its labels (#1420)", async () => {
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");
    await user.type(
      screen.getByLabelText(labelText("Item description")),
      "Winter jacket",
    );
    await selectItemCategory(user, "Jacket");
    await user.click(screen.getByRole("button", { name: "Save donation" }));

    await screen.findByText("Donation recorded");
    expect(screen.getByText("K7M2QX")).toBeInTheDocument();
    expect(
      screen.getByText("Winter jacket", { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Print label/).closest("a")).toHaveAttribute(
      "href",
      "/portal/inventory/donations/labels?donation=donation-1",
    );
  });

  test("a scanned barcode is recorded and prefills an empty item (#1420)", async () => {
    classifyIntakeScanActionMock.mockImplementation(async () => ({
      data: {
        kind: "barcode" as const,
        value: "012345678905",
        prefill: { description: "Burton gloves", categoryKey: "jacket" },
      },
    }));
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");

    await user.click(
      screen.getByRole("button", { name: "Scan label or barcode" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /scan/i }),
      "012345678905{Enter}",
    );

    expect(await screen.findByText(/Barcode 012345678905/)).toBeInTheDocument();
    expect(screen.getByLabelText(labelText("Item description"))).toHaveValue(
      "Burton gloves",
    );

    await user.click(screen.getByRole("button", { name: "Save donation" }));
    await screen.findByText("Donation recorded");
    const payload = createDonationActionMock.mock.calls[0][0];
    expect(payload.items[0]).toMatchObject({
      barcode: "012345678905",
      categoryKey: "jacket",
    });
    expect(payload.items[0].assetTag).toBeUndefined();
  });

  test("a scanned blank label goes on the item, and opening with one prefills it (#1420)", async () => {
    const user = userEvent.setup();
    render(<AddDonationModal initialAssetTag="B7K2QX" />);

    await fillDonorAndContinue(user, "Jane Donor");
    expect(screen.getByText(/Pre-printed label B7K2QX/)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(labelText("Item description")),
      "Winter jacket",
    );
    await selectItemCategory(user, "Jacket");
    await user.click(screen.getByRole("button", { name: "Save donation" }));
    await screen.findByText("Donation recorded");
    expect(createDonationActionMock.mock.calls[0][0].items[0].assetTag).toBe(
      "B7K2QX",
    );
  });
});
