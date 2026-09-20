// #1204: the messages list #1203 wrote for gear requests, now shared by the
// volunteer application and contact message sheets. These cover what the three
// callers rely on it for -- the empty sentence each queue supplies, the sender
// and time under each subject, and the delivery badge that tells a manager
// whether their own message went out.
import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import type { MessageActor, RecordMessageRow } from "@/lib/outbound-messages";
import { RecordMessages } from "./record-messages";

const ACTOR: MessageActor = {
  user_id: "user-1",
  email: "reviewer@example.test",
  full_name: "Dana Reyes",
};

function message(overrides: Partial<RecordMessageRow> = {}): RecordMessageRow {
  return {
    id: crypto.randomUUID(),
    subject: "About your application",
    kind: "staff_message",
    status: "sent",
    created_at: "2026-09-16T15:00:00.000Z",
    sent_by: ACTOR.user_id,
    batch_id: null,
    ...overrides,
  };
}

describe("RecordMessages", () => {
  test("says the caller's own sentence when nothing has been sent", () => {
    render(
      <RecordMessages
        messages={[]}
        actors={[]}
        emptyMessage="Nothing has been sent to this applicant from the portal."
      />,
    );

    expect(
      screen.getByText(
        "Nothing has been sent to this applicant from the portal.",
      ),
    ).toBeDefined();
    expect(screen.queryByText("Sent")).toBeNull();
  });

  test("names the sender under the subject, and shows the delivery", () => {
    render(
      <RecordMessages
        messages={[message({ subject: "Could you do Saturdays?" })]}
        actors={[ACTOR]}
        emptyMessage="Nothing yet."
      />,
    );

    const row = screen.getByRole("row", { name: /Could you do Saturdays\?/ });
    expect(within(row).getByText(/Sent by Dana Reyes/)).toBeDefined();
    expect(within(row).getByText("Sent")).toBeDefined();
  });

  test("distinguishes a resent receipt from a staff member's own message", () => {
    render(
      <RecordMessages
        messages={[
          message({
            subject: "We received your application",
            kind: "volunteer_application_confirmation",
          }),
          message({ subject: "Could you do Saturdays?" }),
        ]}
        actors={[ACTOR]}
        emptyMessage="Nothing yet."
      />,
    );

    expect(screen.getByText(/Receipt, resent by Dana Reyes/)).toBeDefined();
    expect(screen.getByText(/Sent by Dana Reyes/)).toBeDefined();
  });

  test("a send that failed is not reported as delivered", () => {
    render(
      <RecordMessages
        messages={[message({ status: "failed" })]}
        actors={[ACTOR]}
        emptyMessage="Nothing yet."
      />,
    );

    expect(screen.getByText("Not sent")).toBeDefined();
    expect(screen.queryByText("Sent")).toBeNull();
  });

  test("falls back to a description when the sender cannot be named", () => {
    // The lookup is gated on each row's own module, so a reader can hold the
    // module and still be told nothing about an account that has since gone.
    render(
      <RecordMessages
        messages={[message()]}
        actors={[]}
        emptyMessage="Nothing yet."
      />,
    );

    expect(screen.getByText(/Sent by a staff member/)).toBeDefined();
  });
});
