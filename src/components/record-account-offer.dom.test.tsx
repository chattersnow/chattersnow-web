import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClaimActionResult } from "@/app/(public)/my/claim-actions";
import type { ClaimableRecord } from "./record-account-offer";

const claimFromRegistrationActionMock = mock<
  (registrationId: string) => Promise<ClaimActionResult>
>(async () => ({ submitted: true }));
const claimFromGearRequestActionMock = mock<
  (requestId: string) => Promise<ClaimActionResult>
>(async () => ({ submitted: true }));

mock.module("@/app/(public)/my/claim-actions", () => ({
  claimFromRegistrationAction: claimFromRegistrationActionMock,
  claimFromGearRequestAction: claimFromGearRequestActionMock,
}));

const { RecordAccountOffer } = await import("./record-account-offer");

const RECORD_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION: ClaimableRecord = {
  kind: "registration",
  id: RECORD_ID,
};
const GEAR_REQUEST: ClaimableRecord = { kind: "gear-request", id: RECORD_ID };

describe("RecordAccountOffer", () => {
  beforeEach(() => {
    for (const action of [
      claimFromRegistrationActionMock,
      claimFromGearRequestActionMock,
    ]) {
      action.mockClear();
      action.mockImplementation(async () => ({ submitted: true }));
    }
  });

  test("sends a signed-out reader to sign in, carrying the registration", () => {
    render(<RecordAccountOffer offer="sign-up" record={REGISTRATION} />);

    expect(
      screen.getByRole("link", { name: "Make an account" }),
    ).toHaveAttribute(
      "href",
      `/my/sign-in?next=${encodeURIComponent(`/my/registration/${RECORD_ID}`)}`,
    );
  });

  test("sends a signed-out reader to sign in, carrying the gear request", () => {
    render(<RecordAccountOffer offer="sign-up" record={GEAR_REQUEST} />);

    expect(
      screen.getByRole("link", { name: "Make an account" }),
    ).toHaveAttribute(
      "href",
      `/my/sign-in?next=${encodeURIComponent(`/my/gear-request/${RECORD_ID}`)}`,
    );
  });

  test("claims in one click, with nothing to retype", async () => {
    const user = userEvent.setup();
    render(<RecordAccountOffer offer="claim" record={REGISTRATION} />);

    await user.click(screen.getByRole("button", { name: "Add to my account" }));

    expect(claimFromRegistrationActionMock).toHaveBeenCalledWith(RECORD_ID);
    expect(await screen.findByText(/someone will check this/i)).toBeVisible();
  });

  test("a gear request claims through its own action", async () => {
    const user = userEvent.setup();
    render(<RecordAccountOffer offer="claim" record={GEAR_REQUEST} />);

    await user.click(screen.getByRole("button", { name: "Add to my account" }));

    expect(claimFromGearRequestActionMock).toHaveBeenCalledWith(RECORD_ID);
    expect(claimFromRegistrationActionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/someone will check this/i)).toBeVisible();
  });

  // The offer must read identically whether the record matched a directory
  // row, matched nobody, or the account already had a claim open (§5.23). The
  // RPCs are silent about all three, so the only way this could leak is a
  // second confirmation sentence -- there is one, and this is what says so.
  test("says the same thing whatever happened underneath", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <RecordAccountOffer offer="claim" record={REGISTRATION} />,
    );
    await user.click(screen.getByRole("button", { name: "Add to my account" }));
    const first = (await screen.findByRole("alert")).textContent;
    unmount();

    // A claim that was silently dropped -- already linked, already open, the
    // module off -- comes back from the action exactly as a new one does.
    render(<RecordAccountOffer offer="claim" record={REGISTRATION} />);
    await user.click(screen.getByRole("button", { name: "Add to my account" }));
    expect((await screen.findByRole("alert")).textContent).toBe(first);
  });

  // The two records are two surfaces, and §5.23 constrains what each may say.
  // Sharing the component is what keeps them the same sentence; this is what
  // would notice if somebody stopped sharing it.
  test("confirms a kept gear request in the same words as a registration", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <RecordAccountOffer offer="claim" record={REGISTRATION} />,
    );
    await user.click(screen.getByRole("button", { name: "Add to my account" }));
    const registration = (await screen.findByRole("alert")).textContent;
    unmount();

    render(<RecordAccountOffer offer="claim" record={GEAR_REQUEST} />);
    await user.click(screen.getByRole("button", { name: "Add to my account" }));
    expect((await screen.findByRole("alert")).textContent).toBe(registration);
  });

  test("never promises the history it cannot show yet", () => {
    render(<RecordAccountOffer offer="claim" record={GEAR_REQUEST} />);

    expect(screen.getByText(/once we've confirmed who you are/i)).toBeVisible();
    expect(screen.queryByText(/we found you/i)).not.toBeInTheDocument();
  });

  test("skipping takes one click and leaves nothing behind", async () => {
    const user = userEvent.setup();
    render(<RecordAccountOffer offer="claim" record={REGISTRATION} />);

    await user.click(screen.getByRole("button", { name: "No thanks" }));

    expect(
      screen.queryByRole("button", { name: "Add to my account" }),
    ).not.toBeInTheDocument();
    expect(claimFromRegistrationActionMock).not.toHaveBeenCalled();
  });

  test("reports a refusal without asking the reader to fix anything", async () => {
    const user = userEvent.setup();
    claimFromRegistrationActionMock.mockImplementation(async () => ({
      error: "Too many requests just now. Try again in a little while.",
    }));
    render(<RecordAccountOffer offer="claim" record={REGISTRATION} />);

    await user.click(screen.getByRole("button", { name: "Add to my account" }));

    expect(await screen.findByText(/too many requests/i)).toBeVisible();
    // Still offered: nothing was lost, and the registration was never at risk.
    //
    // Awaited, not read (#1288). `setError` is called inside the
    // `startTransition` callback, so React paints the message while
    // `isPending` is still true and the button still reads "Sending...".
    // `findByText` above resolves inside that window, and a synchronous
    // `getByRole` here read the pending button -- which passed on an idle
    // machine, where the transition ends in the same flush, and failed on a
    // loaded CI runner. The component is right to show both at once; this
    // waits for the state it is actually asserting.
    expect(
      await screen.findByRole("button", { name: "Add to my account" }),
    ).toBeInTheDocument();
  });
});
