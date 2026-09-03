import { describe, expect, test } from "bun:test";
import {
  effectiveDueDate,
  isChangesRequestedForMe,
  isMyContentWork,
  overdueStage,
} from "./content-opportunity-shared";

const now = new Date("2026-08-24T12:00:00Z");
const past = "2026-08-20T12:00:00Z";
const future = "2026-08-30T12:00:00Z";

describe("overdueStage", () => {
  test("flags a past-due draft while still drafting", () => {
    expect(
      overdueStage(
        {
          content_status: "draft",
          draft_due_at: past,
          review_due_at: future,
          publish_due_at: future,
        },
        now,
      ),
    ).toBe("draft");
  });

  test("does not flag a draft with a future draft due date", () => {
    expect(
      overdueStage(
        {
          content_status: "idea",
          draft_due_at: future,
          review_due_at: future,
          publish_due_at: future,
        },
        now,
      ),
    ).toBeNull();
  });

  test("flags a past-due review while changes are requested", () => {
    expect(
      overdueStage(
        {
          content_status: "changes_requested",
          draft_due_at: past,
          review_due_at: past,
          publish_due_at: future,
        },
        now,
      ),
    ).toBe("review");
  });

  test("flags a past-due publish once approved", () => {
    expect(
      overdueStage(
        {
          content_status: "approved",
          draft_due_at: past,
          review_due_at: past,
          publish_due_at: past,
        },
        now,
      ),
    ).toBe("publish");
  });

  test("never flags a published item, even with past dates", () => {
    expect(
      overdueStage(
        {
          content_status: "published",
          draft_due_at: past,
          review_due_at: past,
          publish_due_at: past,
        },
        now,
      ),
    ).toBeNull();
  });

  test("never flags a skipped item", () => {
    expect(
      overdueStage(
        {
          content_status: "skipped",
          draft_due_at: past,
          review_due_at: past,
          publish_due_at: past,
        },
        now,
      ),
    ).toBeNull();
  });

  test("treats a missing due date for the current stage as not overdue", () => {
    expect(
      overdueStage(
        {
          content_status: "draft",
          draft_due_at: null,
          review_due_at: future,
          publish_due_at: future,
        },
        now,
      ),
    ).toBeNull();
  });
});

describe("effectiveDueDate", () => {
  test("returns the draft due date while drafting", () => {
    expect(
      effectiveDueDate({
        content_status: "not_planned",
        draft_due_at: past,
        review_due_at: future,
        publish_due_at: future,
      }),
    ).toBe(past);
  });

  test("returns the publish due date once scheduled", () => {
    expect(
      effectiveDueDate({
        content_status: "scheduled",
        draft_due_at: past,
        review_due_at: past,
        publish_due_at: future,
      }),
    ).toBe(future);
  });

  test("returns null once published", () => {
    expect(
      effectiveDueDate({
        content_status: "published",
        draft_due_at: past,
        review_due_at: past,
        publish_due_at: past,
      }),
    ).toBeNull();
  });
});

describe("isMyContentWork", () => {
  const personId = "person-1";

  test("matches the owner", () => {
    expect(
      isMyContentWork(
        { content_status: "draft", owner_id: personId, reviewer_id: null },
        personId,
      ),
    ).toBe(true);
  });

  test("matches the reviewer", () => {
    expect(
      isMyContentWork(
        { content_status: "in_review", owner_id: null, reviewer_id: personId },
        personId,
      ),
    ).toBe(true);
  });

  test("excludes a published item even if owned", () => {
    expect(
      isMyContentWork(
        { content_status: "published", owner_id: personId, reviewer_id: null },
        personId,
      ),
    ).toBe(false);
  });

  test("excludes an unrelated user", () => {
    expect(
      isMyContentWork(
        {
          content_status: "draft",
          owner_id: "another-person",
          reviewer_id: null,
        },
        personId,
      ),
    ).toBe(false);
  });
});

describe("isChangesRequestedForMe", () => {
  const personId = "person-1";

  test("matches the owner when changes are requested", () => {
    expect(
      isChangesRequestedForMe(
        { content_status: "changes_requested", owner_id: personId },
        personId,
      ),
    ).toBe(true);
  });

  test("does not match a different status", () => {
    expect(
      isChangesRequestedForMe(
        { content_status: "draft", owner_id: personId },
        personId,
      ),
    ).toBe(false);
  });

  test("does not match a different owner", () => {
    expect(
      isChangesRequestedForMe(
        { content_status: "changes_requested", owner_id: "another-person" },
        personId,
      ),
    ).toBe(false);
  });
});
