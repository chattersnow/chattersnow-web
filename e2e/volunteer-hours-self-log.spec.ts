// Issue #352: a user who only holds volunteer_hours_logging:manage (not
// volunteers:manage) should get the log-hours dialog pre-filled with their
// own name instead of having to search for and select themselves.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";

const VOLUNTEER_EMAIL = "volunteer@example.test";

test("self-log-only volunteer sees their own name pre-filled and can log hours", async ({
  page,
}) => {
  const admin = createAdminClient();
  const volunteerName = `Casey Rivera ${crypto.randomUUID().slice(0, 8)}`;

  const { data: person, error: insertError } = await admin
    .from("people")
    .insert({
      name: volunteerName,
      email: VOLUNTEER_EMAIL,
      source_type: "individual",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  try {
    await signIn(page, { email: VOLUNTEER_EMAIL });
    await page.goto("/portal/volunteers/participation");

    await page.getByRole("button", { name: "Log hours" }).click();
    const dialog = page.getByRole("dialog", { name: "Log volunteer hours" });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText(volunteerName)).toBeVisible();
    await expect(
      dialog.getByPlaceholder("Search by name or email..."),
    ).not.toBeAttached();
    await expect(
      dialog.getByRole("button", { name: "Change" }),
    ).not.toBeAttached();

    await dialog.getByLabel("Hours").fill("2.5");
    await dialog.getByRole("button", { name: "Log hours" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(volunteerName) }),
    ).toBeVisible();
  } finally {
    await admin.from("volunteer_hours").delete().eq("person_id", person.id);
    await admin.from("people").delete().eq("id", person.id);
  }
});
