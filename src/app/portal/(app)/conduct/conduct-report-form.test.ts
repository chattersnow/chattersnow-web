import { describe, expect, test } from "bun:test";
import {
  parseConductActionForm,
  parseConductAppealForm,
  parseConductProgressForm,
  parseConductRecusalForm,
  parseConductReportForm,
  parseConductReviewerForm,
} from "./conduct-report-form";

const TODAY = "2026-09-22";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const VALID = {
  receivedOn: "2026-09-20",
  channel: "email",
  severity: "moderate",
  summary: "Shouted at another rider in the lift queue.",
  reporterKind: "named",
};

describe("parseConductReportForm", () => {
  test("keeps what a named report says", () => {
    const parsed = parseConductReportForm(
      form({
        ...VALID,
        reporterName: "Jo Rider",
        reporterContact: "jo@example.org",
        subjectDescription: "A coach in a red jacket",
        context: "Lift queue, Saturday morning",
      }),
      TODAY,
    );
    expect(parsed).toEqual({
      data: {
        received_on: "2026-09-20",
        channel: "email",
        reporter_kind: "named",
        reporter_person_id: null,
        reporter_name: "Jo Rider",
        reporter_contact: "jo@example.org",
        subject_person_id: null,
        subject_description: "A coach in a red jacket",
        event_id: null,
        context: "Lift queue, Saturday morning",
        summary: VALID.summary,
        severity: "moderate",
      },
    });
  });

  // The guarantee, not a validation: somebody who fills the name in and then
  // ticks "anonymous" has changed their mind about a promise made to the
  // reporter, and the parser follows rather than arguing. The database refuses
  // the other outcome too (conduct_reports_anonymous_names_nobody).
  test("an anonymous report drops every way of identifying the reporter", () => {
    const parsed = parseConductReportForm(
      form({
        ...VALID,
        reporterKind: "anonymous",
        reporterName: "Jo Rider",
        reporterContact: "jo@example.org",
        reporterPersonId: "0fc0c4e6-8d52-4d0f-9a58-9a3a4f6b1c11",
      }),
      TODAY,
    );
    expect(parsed).toMatchObject({
      data: {
        reporter_kind: "anonymous",
        reporter_name: null,
        reporter_contact: null,
        reporter_person_id: null,
      },
    });
  });

  test("nothing a form posts can set the status or a closing date", () => {
    const parsed = parseConductReportForm(
      form({
        ...VALID,
        status: "closed",
        closedOn: "2026-09-21",
        outcome: "x",
      }),
      TODAY,
    );
    expect(parsed).toHaveProperty("data");
    expect(Object.keys((parsed as { data: object }).data).sort()).toEqual([
      "channel",
      "context",
      "event_id",
      "received_on",
      "reporter_contact",
      "reporter_kind",
      "reporter_name",
      "reporter_person_id",
      "severity",
      "subject_description",
      "subject_person_id",
      "summary",
    ]);
  });

  test("a report cannot have been received tomorrow", () => {
    expect(
      parseConductReportForm(
        form({ ...VALID, receivedOn: "2026-09-23" }),
        TODAY,
      ),
    ).toEqual({
      error: "The date it was received cannot be in the future.",
      field: "receivedOn",
    });
  });

  test("the narrative is required", () => {
    expect(
      parseConductReportForm(form({ ...VALID, summary: "  " }), TODAY),
    ).toEqual({
      error: "Say what was reported.",
      field: "summary",
    });
  });

  test("channel and severity are allowlists", () => {
    expect(
      parseConductReportForm(
        form({ ...VALID, channel: "carrier pigeon" }),
        TODAY,
      ),
    ).toMatchObject({ field: "channel" });
    expect(
      parseConductReportForm(
        form({ ...VALID, severity: "catastrophic" }),
        TODAY,
      ),
    ).toMatchObject({ field: "severity" });
  });
});

describe("parseConductProgressForm", () => {
  test("every step carries its own date", () => {
    expect(
      parseConductProgressForm(
        form({ step: "acknowledge", acknowledgedOn: "2026-09-21" }),
        TODAY,
      ),
    ).toEqual({ data: { step: "acknowledge", acknowledged_on: "2026-09-21" } });

    expect(
      parseConductProgressForm(
        form({
          step: "decide",
          decidedOn: "2026-09-21",
          outcome: "Warning given",
        }),
        TODAY,
      ),
    ).toEqual({
      data: {
        step: "decide",
        decided_on: "2026-09-21",
        outcome: "Warning given",
      },
    });

    expect(
      parseConductProgressForm(
        form({ step: "close", closedOn: "2026-09-22" }),
        TODAY,
      ),
    ).toEqual({ data: { step: "close", closed_on: "2026-09-22" } });
  });

  test("a decision without an outcome is not a decision", () => {
    expect(
      parseConductProgressForm(
        form({ step: "decide", decidedOn: "2026-09-21", outcome: " " }),
        TODAY,
      ),
    ).toEqual({ error: "Say what was decided.", field: "outcome" });
  });

  test("an unknown step is refused rather than guessed at", () => {
    expect(parseConductProgressForm(form({ step: "archive" }), TODAY)).toEqual({
      error: "Unknown step.",
    });
  });
});

describe("the smaller parsers", () => {
  test("a reviewer needs a person and a stage", () => {
    expect(
      parseConductReviewerForm(form({ userId: "u1", stage: "appeal" })),
    ).toEqual({
      data: { user_id: "u1", stage: "appeal" },
    });
    expect(
      parseConductReviewerForm(form({ userId: "u1", stage: "hearing" })),
    ).toMatchObject({
      field: "stage",
    });
  });

  test("a recusal without a reason is refused", () => {
    expect(parseConductRecusalForm(form({ reason: "" }))).toEqual({
      error: "Say why you are stepping back.",
      field: "reason",
    });
  });

  test("an action says what it is, what it was and when", () => {
    expect(
      parseConductActionForm(
        form({
          kind: "interim",
          description: "Not to attend Thursday sessions while we look into it.",
          takenOn: "2026-09-21",
        }),
        TODAY,
      ),
    ).toEqual({
      data: {
        kind: "interim",
        description: "Not to attend Thursday sessions while we look into it.",
        taken_on: "2026-09-21",
      },
    });
  });

  test("an appeal's grounds are optional, its filing date is not", () => {
    expect(
      parseConductAppealForm(form({ filedOn: "2026-09-22" }), TODAY),
    ).toEqual({
      data: { filed_on: "2026-09-22", grounds: null },
    });
    expect(parseConductAppealForm(form({}), TODAY)).toMatchObject({
      field: "filedOn",
    });
  });
});
