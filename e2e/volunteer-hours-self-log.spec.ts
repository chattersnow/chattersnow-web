// Issue #352: a user who only holds volunteer_hours_logging:manage (not
// volunteers:manage) should get the log-hours dialog pre-filled with their
// own name instead of having to search for and select themselves.
//
// Uses a freshly created auth user (volunteer role) rather than the shared
// seeded volunteer@example.test account: test:e2e:pr runs this spec under
// two projects (chromium, mobile-chromium) fully in parallel, and two
// concurrent password sign-ins for the exact same shared account raced and
// consistently lost on one project (a 5s timeout waiting for the
// post-login redirect, with the other project's identical run passing in
// the same CI run, twice in a row). A unique account per run removes that
// collision outright.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";

test("self-log-only volunteer sees their own name pre-filled and can log hours", async ({
  page,
}) => {
  const admin = createAdminClient();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-volunteer-${suffix}@example.test`;
  const password = "password123";
  const volunteerName = `E2E Volunteer ${suffix}`;

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userError || !userData.user) {
    throw userError ?? new Error("createUser returned no user");
  }
  const userId = userData.user.id;

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("name", "volunteer")
    .single();
  if (roleError) throw roleError;

  const { error: userRoleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: role.id, created_by: userId });
  if (userRoleError) throw userRoleError;

  const { data: person, error: insertError } = await admin
    .from("people")
    .insert({ name: volunteerName, email, source_type: "individual" })
    .select("id")
    .single();
  if (insertError) throw insertError;

  try {
    await signIn(page, { email, password });
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
    await admin.auth.admin.deleteUser(userId);
  }
});
