// Issue #1079: nothing the mobile shell renders may widen the document.
//
// Reported from an iPhone 15 Pro Max as "I have to zoom out to see the entire
// screen", with a screenshot showing the page scrolled right and the left edge
// of every row cut off. The cause was the dashboard's summary rows: the value
// span carried `shrink-0` while holding tenant content -- an event's name --
// so a long enough name set the row's width, and with nothing above it
// constraining the page the whole document grew past the viewport.
//
// The seeded event name is short, which is exactly why the original PR's
// testing missed it. This seeds a realistically long one instead: design and
// tests both have to use the content's real extremes rather than tidy samples.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";

test.use({ viewport: { width: 430, height: 932 }, hasTouch: true });

const LONG_EVENT_NAME =
  "Queer Ride Day x 5 Boroughs Summer 2026 Community Edition Fundraiser";

test("a long event name does not widen the mobile dashboard", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: next, error } = await admin
    .from("events")
    .select("id, name")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .single();
  if (error) throw error;

  const originalName = next.name as string;
  await admin
    .from("events")
    .update({ name: LONG_EVENT_NAME })
    .eq("id", next.id);

  try {
    await signIn(page);
    await page
      .context()
      .addCookies([
        { name: "device_override", value: "mobile", url: page.url() },
      ]);
    await page.goto("/portal/home", { waitUntil: "networkidle" });

    const report = await page.evaluate(() => {
      const doc = document.documentElement;
      const offenders: string[] = [];
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        // Skip anything inside a scroller of its own: a wide table is allowed
        // to scroll, it is just not allowed to widen the page.
        if (rect.right > doc.clientWidth + 1) {
          const node = el as HTMLElement;
          offenders.push(
            `${node.tagName.toLowerCase()}.${(node.className || "").toString().split(" ").slice(0, 3).join(".")} → ${Math.round(rect.right)}px`,
          );
        }
      }
      return {
        clientWidth: doc.clientWidth,
        scrollWidth: doc.scrollWidth,
        offenders: offenders.slice(0, 8),
      };
    });

    // The document, not the row: a row that overflows its own container is a
    // cosmetic bug, but a document wider than the viewport is the one that
    // makes the reader zoom out.
    expect(
      report.scrollWidth,
      `document overflows by ${report.scrollWidth - report.clientWidth}px: ${report.offenders.join(", ")}`,
    ).toBe(report.clientWidth);
  } finally {
    await admin.from("events").update({ name: originalName }).eq("id", next.id);
  }
});
