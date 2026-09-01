import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Giveaway, GiveawayPrize } from "../giveaway-actions";
import type { PersonListItem } from "../../people/actions";
import * as GiveawayActions from "../giveaway-actions";

type PrizeActionResult = { error: string } | { success: true };
type PrizeAction = (
  id: string,
  donorPersonId: string | null,
  formData: FormData,
  sourceInventoryItemId?: string | null,
  sourceMonetaryDonationId?: string | null,
) => Promise<PrizeActionResult>;

const createGiveawayPrizeActionMock = mock<PrizeAction>(async () => ({
  success: true,
}));
const updateGiveawayPrizeActionMock = mock<PrizeAction>(async () => ({
  success: true,
}));
const listAvailableGiveawaySourcesActionMock = mock(
  async (_eventId: string, _includePrizeId?: string | null) => ({
    data: {
      inventoryItems: [
        {
          id: "item-1",
          description: "Donated snowboard",
          face_value: 300,
          donor: {
            id: "person-1",
            name: "Jane Doe",
            email: null,
            phone: null,
          },
        },
      ],
      monetaryDonations: [] as never[],
    },
  }),
);

mock.module("../giveaway-actions", () => ({
  ...GiveawayActions,
  createGiveawayPrizeAction: createGiveawayPrizeActionMock,
  updateGiveawayPrizeAction: updateGiveawayPrizeActionMock,
  listAvailableGiveawaySourcesAction: listAvailableGiveawaySourcesActionMock,
}));

const { PrizeForm, PrizesSection } = await import("./prizes");

const people: PersonListItem[] = [
  {
    id: "person-1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
    is_sponsor: false,
  },
];

function makePrize(overrides: Partial<GiveawayPrize> = {}): GiveawayPrize {
  return {
    id: "prize-1",
    giveaway_id: "giveaway-1",
    prize_name: "Season pass",
    donor_person_id: null,
    donor: null,
    estimated_value: 250,
    notes: "Signed by the team",
    source_inventory_item_id: null,
    source_monetary_donation_id: null,
    source_item: null,
    source_donation: null,
    giveaway_winners: null,
    ...overrides,
  };
}

function makeGiveaway(prizes: GiveawayPrize[]): Giveaway {
  return {
    id: "giveaway-1",
    event_id: "event-1",
    name: "Season pass giveaway",
    tickets_sold: 0,
    ticket_price: null,
    revenue_amount: 0,
    drawing_date: null,
    notes: null,
    giveaway_prizes: prizes,
  };
}

function noop() {}

// The estimated-value field is `type="number" step="0.01"`, and happy-dom's
// step check does the arithmetic in binary floating point -- 250 / 0.01 comes
// out as 24999.999999999996, so it calls a perfectly good money amount a
// stepMismatch and swallows the click on the submit button. Real browsers
// accept it. Submitting the form directly skips that constraint check; the
// React handler under test is the same either way.
function submitForm() {
  const form = document.querySelector("form");
  if (!form) throw new Error("expected a prize form");
  fireEvent.submit(form);
}

function renderSection(prize: GiveawayPrize, editingPrizeId: string | null) {
  const onEditPrize = mock(() => {});
  render(
    <PrizesSection
      giveaway={makeGiveaway([prize])}
      people={people}
      canEdit
      isDeleting={false}
      editingWinnerId={null}
      editingPrizeId={editingPrizeId}
      showAddPrize={false}
      onPersonCreated={noop}
      onDeletePrize={noop}
      onEditPrize={onEditPrize}
      onPrizeSaved={noop}
      onCancelPrizeEdit={noop}
      onEditWinner={noop}
      onWinnerSaved={noop}
      onCancelWinnerEdit={noop}
      onToggleAddPrize={noop}
      onPrizeAdded={noop}
    />,
  );
  return { onEditPrize };
}

describe("PrizeForm", () => {
  beforeEach(() => {
    createGiveawayPrizeActionMock.mockClear();
    updateGiveawayPrizeActionMock.mockClear();
    listAvailableGiveawaySourcesActionMock.mockClear();
  });

  test("adding a prize asks for sources without a prize id", async () => {
    render(
      <PrizeForm
        giveawayId="giveaway-1"
        eventId="event-1"
        people={people}
        onPersonCreated={noop}
        onSaved={noop}
        onCancel={noop}
      />,
    );

    await waitFor(() =>
      expect(listAvailableGiveawaySourcesActionMock).toHaveBeenCalledWith(
        "event-1",
        null,
      ),
    );
    expect(screen.getByRole("button", { name: "Add prize" })).toBeVisible();
  });

  test("editing a prize prefills its fields and saves an update", async () => {
    const onSaved = mock(() => {});
    render(
      <PrizeForm
        giveawayId="giveaway-1"
        eventId="event-1"
        prize={makePrize({ source_inventory_item_id: "item-1" })}
        people={people}
        onPersonCreated={noop}
        onSaved={onSaved}
        onCancel={noop}
      />,
    );

    // Its own current source has to be requested explicitly -- the RPC hides
    // every already-linked donation, this prize's included.
    await waitFor(() =>
      expect(listAvailableGiveawaySourcesActionMock).toHaveBeenCalledWith(
        "event-1",
        "prize-1",
      ),
    );

    expect(screen.getByLabelText("Prize name")).toHaveValue("Season pass");
    expect(screen.getByLabelText("Estimated value ($)")).toHaveValue(250);
    expect(screen.getByLabelText("Notes")).toHaveValue("Signed by the team");

    submitForm();

    await waitFor(() =>
      expect(updateGiveawayPrizeActionMock).toHaveBeenCalledTimes(1),
    );
    expect(createGiveawayPrizeActionMock).not.toHaveBeenCalled();

    const [prizeId, donorId, , sourceItemId] =
      updateGiveawayPrizeActionMock.mock.calls[0];
    expect(prizeId).toBe("prize-1");
    expect(donorId).toBeNull();
    expect(sourceItemId).toBe("item-1");
    expect(onSaved).toHaveBeenCalled();
  });

  test("surfaces the action's error and keeps the form open", async () => {
    updateGiveawayPrizeActionMock.mockImplementationOnce(async () => ({
      error: "That donation is no longer available.",
    }));
    const onSaved = mock(() => {});
    render(
      <PrizeForm
        giveawayId="giveaway-1"
        eventId="event-1"
        prize={makePrize()}
        people={people}
        onPersonCreated={noop}
        onSaved={onSaved}
        onCancel={noop}
      />,
    );

    submitForm();

    expect(
      await screen.findByText("That donation is no longer available."),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("PrizesSection", () => {
  test("offers an Edit control that reports the prize id", async () => {
    const user = userEvent.setup();
    const { onEditPrize } = renderSection(makePrize(), null);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(onEditPrize).toHaveBeenCalledWith("prize-1");
  });

  test("swaps the prize row for the form while it is being edited", async () => {
    renderSection(makePrize(), "prize-1");

    expect(screen.getByRole("button", { name: "Save prize" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});
