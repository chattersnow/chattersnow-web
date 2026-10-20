import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as DiscountCodesActions from "./discount-codes-actions";
import * as RegistrantsActions from "./registrants-actions";
import type { DiscountCode } from "./discount-codes-actions";
import type { EventRegistrantsData } from "./registrants-actions";
import type { TabData } from "@/hooks/use-tab-data";

const SHARED_CODE: DiscountCode = {
  id: "code-1",
  event_id: "event-1",
  code: "SNOWDAY",
  description: null,
  source: null,
  kind: "rental",
  value: null,
  shared: true,
  pin: null,
  coverage: [],
  registration_id: null,
  assigned_at: null,
  sent_at: null,
  sent_to_name: null,
  sent_to_email: null,
  notes: null,
  created_at: "2026-01-05T00:00:00Z",
  registration: null,
};

const listDiscountCodesActionMock = mock(async () => ({
  data: [SHARED_CODE],
}));
const updateDiscountCodeActionMock = mock(
  async (): Promise<DiscountCodesActions.DiscountCodeActionResult> => ({
    success: true,
  }),
);

mock.module("./discount-codes-actions", () => ({
  ...DiscountCodesActions,
  listDiscountCodesAction: listDiscountCodesActionMock,
  updateDiscountCodeAction: updateDiscountCodeActionMock,
}));
mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrationOptionsAction: async () => ({
    data: { options: [] },
  }),
}));

const { DiscountCodesTab } = await import("./discount-codes-tab");

const refreshRegistrants = mock(() => {});
const refreshDerived = mock(() => {});

const registrants: TabData<EventRegistrantsData> = {
  data: undefined,
  loadError: null,
  refresh: refreshRegistrants,
};

beforeEach(() => {
  listDiscountCodesActionMock.mockClear();
  updateDiscountCodeActionMock.mockClear();
  refreshRegistrants.mockClear();
  refreshDerived.mockClear();
});

describe("DiscountCodesTab", () => {
  test("saving an edited code refreshes the Results card's Outcomes (#1619)", async () => {
    const user = userEvent.setup();
    render(
      <DiscountCodesTab
        eventId="event-1"
        mode="edit"
        registrants={registrants}
        refreshDerived={refreshDerived}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Edit shared code SNOWDAY" }),
    );
    await user.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateDiscountCodeActionMock).toHaveBeenCalledTimes(1);
      expect(refreshDerived).toHaveBeenCalledTimes(1);
    });
    expect(listDiscountCodesActionMock).toHaveBeenCalledTimes(2);
    expect(refreshRegistrants).toHaveBeenCalledTimes(1);
  });
});
