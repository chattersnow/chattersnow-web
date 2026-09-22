// Issue #1203: messaging a gear requester from the portal. The portal's gear
// request queue had no browser coverage before this; what is exercised here is
// the part types and unit tests cannot see -- that the composer opens on the
// request detail, that a message reaches the sender and comes back in the
// Messages card, and that resending the receipt twice in a minute is one send.
//
// RESEND_API_KEY is unset in this environment (as in CI), so sendEmail() logs
// instead of contacting a provider: the whole path runs with no mail leaving
// the building.
//
// The request is created through the real public RPC rather than inserted, and
// its items are this run's own: the suite runs fully parallel against one
// database, and requesting gear consumes an item permanently.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";

type AdminClient = ReturnType<typeof createAdminClient>;

async function seedGearRequest(admin: AdminClient) {
  const { data: donation, error: donationError } = await admin
    .from("donations")
    .select("id, created_by")
    .limit(1)
    .single();
  if (donationError) throw donationError;

  const suffix = crypto.randomUUID().slice(0, 8);
  const { data: items, error: itemsError } = await admin
    .from("inventory_items")
    .insert({
      donation_id: donation.id,
      created_by: donation.created_by,
      description: `E2E message gear ${suffix}`,
      type: "jacket",
      condition: "good",
      status: "available",
    })
    .select("id");
  if (itemsError) throw itemsError;
  const itemIds = (items ?? []).map((item) => item.id as string);

  const email = `e2e-message-${suffix}@example.test`;
  const { data: requestId, error } = await admin.rpc("request_gear_items", {
    p_inventory_item_ids: itemIds,
    p_name: "E2E Message Requester",
    p_email: email,
    p_phone: null,
    p_notes: null,
    p_honeypot: null,
    // The RPC caps a single IP at 8 requests per 15 minutes, and the suite
    // runs several projects at once.
    p_ip_address: `10.${Math.floor(Math.random() * 256)}.${Math.floor(
      Math.random() * 256,
    )}.${Math.floor(Math.random() * 256)}`,
    // #1367: every request records that the requester was told the items are
    // given as-is. The real callers resolve the wording server-side.
    p_as_is_acknowledged: true,
    p_as_is_text: "Given as-is.",
  });
  if (error) throw error;

  return {
    id: requestId as string,
    email,
    suffix,
    async cleanup() {
      await admin
        .from("outbound_messages")
        .delete()
        .eq("record_id", requestId as string);
      await admin
        .from("inventory_movements")
        .delete()
        .in("inventory_item_id", itemIds);
      await admin.from("inventory_items").delete().in("id", itemIds);
      await admin
        .from("gear_requests")
        .delete()
        .eq("id", requestId as string);
      await admin.from("people").delete().eq("email", email);
    },
  };
}

test.describe("portal gear request messaging", () => {
  test("writes to the requester and resends the receipt", async ({ page }) => {
    const admin = createAdminClient();
    const request = await seedGearRequest(admin);

    try {
      await signIn(page);
      await page.goto(`/portal/inventory/requests/${request.id}`);

      await expect(
        page.getByText(/Nothing has been sent to this requester/),
      ).toBeVisible();

      await page.getByRole("button", { name: "Contact requester" }).click();
      const composer = modal(page);
      // The address is shown, never typed: the action resolves the recipient
      // from the request itself.
      await expect(composer.getByText(request.email)).toBeVisible();
      await expect(
        composer.getByText(/this isn't an inbox in the portal/),
      ).toBeVisible();

      const subject = `E2E subject ${request.suffix}`;
      await composer.getByRole("textbox", { name: "Subject" }).fill(subject);
      await composer
        .getByRole("textbox", { name: "Message" })
        .fill("The blue one is gone.\n\nWould the grey do?");
      await composer.getByRole("button", { name: "Send message" }).click();

      await expect(composer).toBeHidden();
      await expect(page.getByRole("cell", { name: subject })).toBeVisible();
      await expect(
        page.getByRole("row", { name: new RegExp(subject) }),
      ).toContainText("Sent");
      // The receipt, sent again for somebody who says it never arrived.
      await page.getByRole("button", { name: "Resend confirmation" }).click();
      await expect(
        page.getByRole("cell", { name: /We received your request/ }),
      ).toBeVisible();

      // Twice inside the minute is a double-click, not a second request.
      await page.getByRole("button", { name: "Resend confirmation" }).click();
      await expect(
        page.getByText(
          "The confirmation has already been resent in the last minute.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("cell", { name: /We received your request/ }),
      ).toHaveCount(1);
    } finally {
      await request.cleanup();
    }
  });
});
