import { describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import type {
  NotificationRecipient,
  NotificationRecipientsByKind,
  ReceiptDelivery,
} from "@/lib/notifications/recipients";

const noop = async () => ({ success: true });
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
// Nothing here saves; the actions module pulls in server-only imports.
mock.module("./actions", () => ({
  updateEmailNotificationsEnabledAction: noop,
  updateOpsReportRecipientsAction: noop,
  updateSenderIdentityAction: noop,
}));

const { NotificationsPanel } = await import("./notifications-panel");

function person(
  name: string,
  flags: Pick<NotificationRecipient, "optedIn" | "holdsRole">,
): NotificationRecipient {
  return {
    personId: name,
    name,
    email: `${name.toLowerCase()}@example.test`,
    ...flags,
    receives: flags.optedIn && flags.holdsRole,
  };
}

function renderPanel({
  emailEnabled = true,
  recipientsByKind = {},
  receiptDelivery = {},
}: {
  emailEnabled?: boolean;
  recipientsByKind?: NotificationRecipientsByKind | null;
  receiptDelivery?: Record<string, ReceiptDelivery> | null;
} = {}) {
  render(
    <NotificationsPanel
      emailEnabled={emailEnabled}
      kinds={NOTIFICATION_KINDS}
      recipientsByKind={recipientsByKind}
      receiptDelivery={receiptDelivery}
      opsReportRecipients={[]}
      orgName="Example Nonprofit"
      platformFrom="notifications@example.test"
      sendingDomain={null}
      replyTo={null}
      fromAddress={null}
    />,
  );
}

/** The row for one kind, found by its label. */
function kindRow(label: string): HTMLElement {
  return screen.getByText(label, { selector: "p" }).closest("li")!;
}

describe("NotificationsPanel who receives what (#1484)", () => {
  test("groups the kinds by audience under their own titles", () => {
    renderPanel();

    const staff = NOTIFICATION_KINDS.filter(
      (k) => k.audience !== "constituent",
    );
    const receipts = NOTIFICATION_KINDS.filter(
      (k) => k.audience === "constituent",
    );
    const staffCard = screen
      .getByText("Staff notifications")
      .closest("[data-slot=card]") as HTMLElement;
    const receiptCard = screen
      .getByText("Receipts to the public")
      .closest("[data-slot=card]") as HTMLElement;

    expect(within(staffCard).getAllByRole("listitem")).toHaveLength(
      staff.length,
    );
    expect(within(receiptCard).getAllByRole("listitem")).toHaveLength(
      receipts.length,
    );
    expect(
      within(receiptCard).queryByText("New volunteer applications"),
    ).toBeNull();
  });

  test("summarises a staff kind with a count and a badge per gap", () => {
    renderPanel({
      recipientsByKind: {
        volunteer_application: [
          person("Ada", { optedIn: true, holdsRole: true }),
          person("Ben", { optedIn: true, holdsRole: true }),
          person("Cy", { optedIn: false, holdsRole: true }),
          person("Di", { optedIn: true, holdsRole: false }),
        ],
      },
    });

    const row = kindRow("New volunteer applications");
    expect(within(row).getByText("2 recipients")).toBeTruthy();
    expect(within(row).getByText("1 not opted in")).toBeTruthy();
    expect(within(row).getByText("1 without the role")).toBeTruthy();
    // The lists stay visible under the summary.
    expect(within(row).getByText(/Ada \(ada@example\.test\)/)).toBeTruthy();

    expect(
      within(kindRow("New gear requests")).getByText(
        "Nobody receives this at the moment.",
      ),
    ).toBeTruthy();
  });

  // What the issue asked to verify: receipts are opt-out, so the recipient
  // read has nobody to list for them and the card used to say nobody got one.
  test("describes a receipt as sent to submitters, not received by nobody", () => {
    renderPanel({
      receiptDelivery: {
        event_registration_confirmation: { optedOut: 3, switchedOff: false },
        gear_request_confirmation: { optedOut: 0, switchedOff: true },
      },
    });

    const registration = kindRow("Event registration confirmations");
    expect(within(registration).getByText("3 opted out")).toBeTruthy();
    expect(
      within(registration).getByText(
        "Sent to everyone who submits the form, except the 3 people who have opted out.",
      ),
    ).toBeTruthy();

    expect(
      within(kindRow("Gear request updates")).getByText(
        "Switched off under Automatic Replies, so nobody gets it.",
      ),
    ).toBeTruthy();
    expect(
      within(kindRow("Contact message receipts")).getByText(
        "Sent to everyone who submits the form. Nobody has opted out.",
      ),
    ).toBeTruthy();
    expect(
      within(registration).queryByText("Nobody receives this at the moment."),
    ).toBeNull();
  });

  test("says the list failed rather than claiming nobody receives anything", () => {
    renderPanel({ recipientsByKind: null });

    expect(screen.getByText(/recipient list could not be loaded/)).toBeTruthy();
    expect(screen.queryByText("Staff notifications")).toBeNull();
  });
});

describe("NotificationsPanel outbound email switch (#1484)", () => {
  test("is titled, and marked when it is off", () => {
    renderPanel({ emailEnabled: false });

    const toggle = screen.getByRole("switch", { name: "Outbound email" });
    expect(toggle.closest("[data-slot=card]")?.getAttribute("data-state")).toBe(
      "off",
    );
    expect(screen.getByText(/No email is going out/)).toBeTruthy();
  });
});
