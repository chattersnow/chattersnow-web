import { describe, expect, test } from "bun:test";
import {
  DEFAULT_REMINDER_INTRO,
  REMINDER_DAILY_LIMIT_DEFAULT,
  reminderDailyLimit,
  reminderIntro,
  reminderStatusText,
  storedReminderIntro,
} from "./event-reminders";

describe("event reminders (#1652)", () => {
  test("stores null for a blank or default intro", () => {
    expect(storedReminderIntro("  ")).toBeNull();
    expect(storedReminderIntro(` ${DEFAULT_REMINDER_INTRO} `)).toBeNull();
    expect(storedReminderIntro(" Bring layers ")).toBe("Bring layers");
    expect(reminderIntro(null)).toBe(DEFAULT_REMINDER_INTRO);
  });

  test("reads the daily limit, defaulting to the free tier's cap", () => {
    expect(reminderDailyLimit(undefined)).toBe(REMINDER_DAILY_LIMIT_DEFAULT);
    expect(reminderDailyLimit("abc")).toBe(REMINDER_DAILY_LIMIT_DEFAULT);
    expect(reminderDailyLimit("-1")).toBe(REMINDER_DAILY_LIMIT_DEFAULT);
    expect(reminderDailyLimit("5000")).toBe(5000);
  });

  test("says scheduled, part-sent or sent", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    expect(
      reminderStatusText(
        { sendAt: "2026-03-12T15:00:00Z", recipients: 1, sent: 0 },
        "Mar 12",
        now,
      ),
    ).toBe("Scheduled for Mar 12 · 1 recipient");
    expect(
      reminderStatusText(
        { sendAt: "2026-03-09T15:00:00Z", recipients: 140, sent: 100 },
        "Mar 9",
        now,
      ),
    ).toBe("Sent 100 of 140 · the rest go in the next hourly run");
    expect(
      reminderStatusText(
        { sendAt: "2026-03-09T15:00:00Z", recipients: 140, sent: 140 },
        "Mar 9",
        now,
      ),
    ).toBe("Sent Mar 9 · 140 recipients");
  });
});
