// Integration coverage for the private `documents` bucket, the governance
// `document_path` columns (#1489) and the finance `receipt_path` columns
// (#1490), against a real local Supabase stack.
//
// The bucket's isolation lives in object paths and `storage.objects` policies,
// where `tenant_isolation_gaps()` can't see it, so this file is what asserts
// it -- and, the reason the ticket names, that an account without governance
// access cannot read a document even when it holds the path.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import { DOCUMENTS_BUCKET } from "./documents";

const service = serviceRoleClient();
const anon = anonClient();

/** Storage matches `allowed_mime_types` on the declared type, not the bytes. */
function pdfBlob() {
  return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
    type: "application/pdf",
  });
}

let admin: SupabaseClient;
let board: SupabaseClient;
let coordinator: SupabaseClient;
let finance: SupabaseClient;
let volunteer: SupabaseClient;
let tenantId: string;
let otherTenantId: string;

/** Every path written here, cleaned up as service_role regardless of policy. */
const created: string[] = [];
const createdBylaws: string[] = [];
const createdExpenses: string[] = [];
const createdReimbursements: string[] = [];

function path(tenant: string, module = "governance", name = "doc.pdf") {
  const value = `${tenant}/${module}/${crypto.randomUUID()}/${name}`;
  created.push(value);
  return value;
}

async function upload(client: SupabaseClient, objectPath: string) {
  return client.storage
    .from(DOCUMENTS_BUCKET)
    .upload(objectPath, pdfBlob(), { contentType: "application/pdf" });
}

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (tenantError) throw tenantError;
  tenantId = tenant.id as string;

  // Archived, not active: a second active tenant knocks default_tenant_id()
  // off its sole-tenant fallback for every other file sharing this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Documents Test Org",
      slug: `documents-${crypto.randomUUID().slice(0, 8)}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;
  otherTenantId = other.id as string;

  admin = await signInAs(SEEDED_USERS.admin);
  board = await signInAs(SEEDED_USERS.board);
  coordinator = await signInAs(SEEDED_USERS.coordinator);
  finance = await signInAs(SEEDED_USERS.finance);
  volunteer = await signInAs(SEEDED_USERS.volunteer);
});

afterAll(async () => {
  if (createdReimbursements.length) {
    await service
      .from("reimbursements")
      .delete()
      .in("id", createdReimbursements);
  }
  if (createdExpenses.length) {
    await service.from("event_expenses").delete().in("id", createdExpenses);
  }
  if (createdBylaws.length) {
    await service.from("bylaws").delete().in("id", createdBylaws);
  }
  if (created.length) {
    await service.storage.from(DOCUMENTS_BUCKET).remove(created);
  }
  await service
    .from("retention_policies")
    .delete()
    .eq("tenant_id", otherTenantId);
  const { error } = await service
    .from("tenants")
    .delete()
    .eq("id", otherTenantId);
  if (error) throw error;
});

describe("documents bucket", () => {
  test("is private, size-capped and PDF-or-image only", async () => {
    const { data: bucket, error } =
      await service.storage.getBucket(DOCUMENTS_BUCKET);
    expect(error).toBeNull();
    expect(bucket?.public).toBe(false);
    expect(bucket?.file_size_limit).toBe(10485760);
    expect(bucket?.allowed_mime_types).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});

describe("documents writes", () => {
  test("governance managers can upload under their tenant's governance folder", async () => {
    for (const client of [admin, board]) {
      const { error } = await upload(client, path(tenantId));
      expect(error).toBeNull();
    }
  });

  test("accounts without governance manage cannot upload", async () => {
    for (const client of [finance, volunteer, anon]) {
      const { error } = await upload(client, path(tenantId));
      expect(error).not.toBeNull();
    }
  });

  test("another tenant's prefix, another module or the wrong depth is refused", async () => {
    for (const objectPath of [
      path(otherTenantId),
      path(tenantId, "finance"),
      `${tenantId}/governance/flat.pdf`,
    ]) {
      created.push(objectPath);
      const { error } = await upload(admin, objectPath);
      expect(error).not.toBeNull();
    }
  });

  test("a type outside the allowed list is refused", async () => {
    const { error } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path(tenantId, "governance", "notes.txt"), new Blob(["x"]), {
        contentType: "text/plain",
      });
    expect(error).not.toBeNull();
  });
});

describe("documents reads", () => {
  let objectPath: string;

  beforeAll(async () => {
    objectPath = path(tenantId);
    const { error } = await upload(board, objectPath);
    if (error) throw error;
  });

  test("a governance reader can sign and download it", async () => {
    const { data: signed, error } = await board.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(objectPath, 60);
    expect(error).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();

    const response = await fetch(signed!.signedUrl);
    expect(response.status).toBe(200);
  });

  // The ticket's acceptance case: holding the path is not access.
  test("an account without governance access cannot read it, even with the path", async () => {
    for (const client of [finance, volunteer, anon]) {
      const { data: signed } = await client.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(objectPath, 60);
      expect(signed?.signedUrl ?? null).toBeNull();

      const { data: blob } = await client.storage
        .from(DOCUMENTS_BUCKET)
        .download(objectPath);
      expect(blob).toBeNull();
    }
  });

  test("there is no public URL to fall back on", async () => {
    const { data } = service.storage
      .from(DOCUMENTS_BUCKET)
      .getPublicUrl(objectPath);
    const response = await fetch(data.publicUrl);
    expect(response.ok).toBe(false);
  });
});

describe("governance document_path", () => {
  async function insertBylaws(fields: Record<string, string | null>) {
    const { data, error } = await admin
      .from("bylaws")
      .insert({
        version: `Documents test ${crypto.randomUUID().slice(0, 8)}`,
        effective_date: "2026-01-01",
        ...fields,
      })
      .select("id")
      .maybeSingle();
    if (data?.id) createdBylaws.push(data.id as string);
    return { data, error };
  }

  test("holds a path under the row's own tenant", async () => {
    const { error } = await insertBylaws({ document_path: path(tenantId) });
    expect(error).toBeNull();
  });

  test("refuses a link and a path together", async () => {
    const { error } = await insertBylaws({
      external_link: "https://example.com/bylaws.pdf",
      document_path: path(tenantId),
    });
    expect(error?.message).toContain("bylaws_one_document");
  });

  test("refuses another tenant's path or another module's", async () => {
    for (const documentPath of [
      path(otherTenantId),
      path(tenantId, "finance"),
    ]) {
      const { error } = await insertBylaws({ document_path: documentPath });
      expect(error?.message).toContain("bylaws_document_path_in_tenant");
    }
  });
});

describe("receipts", () => {
  async function insertExpense(
    client: SupabaseClient,
    fields: Record<string, string | null>,
  ) {
    const { data, error } = await client
      .from("event_expenses")
      .insert({
        description: `Receipt test ${crypto.randomUUID().slice(0, 8)}`,
        expense_date: "2026-01-01",
        amount: 12.5,
        ...fields,
      })
      .select("id")
      .maybeSingle();
    if (data?.id) createdExpenses.push(data.id as string);
    return { data, error };
  }

  async function insertReimbursement(
    client: SupabaseClient,
    fields: Record<string, string | null>,
  ) {
    const { data: person, error: personError } = await service
      .from("people")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .single();
    if (personError) throw personError;
    const { data, error } = await client
      .from("reimbursements")
      .insert({
        person_id: person.id,
        description: `Receipt test ${crypto.randomUUID().slice(0, 8)}`,
        amount: 12.5,
        ...fields,
      })
      .select("id")
      .maybeSingle();
    if (data?.id) createdReimbursements.push(data.id as string);
    return { data, error };
  }

  async function canRead(client: SupabaseClient, objectPath: string) {
    const { data } = await client.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(objectPath, 60);
    return !!data?.signedUrl;
  }

  test("whoever records spend can upload one; nobody else can", async () => {
    for (const client of [admin, finance, coordinator]) {
      const { error } = await upload(client, path(tenantId, "receipts"));
      expect(error).toBeNull();
    }
    for (const client of [board, volunteer, anon]) {
      const { error } = await upload(client, path(tenantId, "receipts"));
      expect(error).not.toBeNull();
    }
  });

  test("another tenant's prefix or the wrong depth is refused", async () => {
    for (const objectPath of [
      path(otherTenantId, "receipts"),
      `${tenantId}/receipts/flat.pdf`,
    ]) {
      created.push(objectPath);
      const { error } = await upload(finance, objectPath);
      expect(error).not.toBeNull();
    }
  });

  test("an unsaved upload is readable only by the person who uploaded it", async () => {
    const objectPath = path(tenantId, "receipts");
    const { error } = await upload(coordinator, objectPath);
    if (error) throw error;

    expect(await canRead(coordinator, objectPath)).toBe(true);
    for (const client of [admin, finance, board, volunteer, anon]) {
      expect(await canRead(client, objectPath)).toBe(false);
    }
  });

  test("an expense's receipt reads for whoever can see the expense", async () => {
    const objectPath = path(tenantId, "receipts");
    const { error: uploadError } = await upload(coordinator, objectPath);
    if (uploadError) throw uploadError;
    const { error } = await insertExpense(coordinator, {
      receipt_path: objectPath,
    });
    expect(error).toBeNull();

    // finance and admin hold event_expenses; board and volunteer do not.
    for (const client of [coordinator, finance, admin]) {
      expect(await canRead(client, objectPath)).toBe(true);
    }
    for (const client of [board, volunteer, anon]) {
      expect(await canRead(client, objectPath)).toBe(false);
    }
  });

  // The ticket's acceptance case: an approver outside finance sees the
  // receipt they are deciding on; nobody else outside it does.
  test("a reimbursement's receipt reads for its approver, not for others outside finance", async () => {
    const objectPath = path(tenantId, "receipts");
    const { error: uploadError } = await upload(coordinator, objectPath);
    if (uploadError) throw uploadError;
    const { error } = await insertReimbursement(coordinator, {
      receipt_path: objectPath,
    });
    expect(error).toBeNull();

    for (const client of [coordinator, finance, board]) {
      expect(await canRead(client, objectPath)).toBe(true);
    }
    for (const client of [volunteer, anon]) {
      expect(await canRead(client, objectPath)).toBe(false);
    }
  });

  test("only the uploader can delete a receipt object", async () => {
    const objectPath = path(tenantId, "receipts");
    const { error: uploadError } = await upload(coordinator, objectPath);
    if (uploadError) throw uploadError;
    await insertExpense(coordinator, { receipt_path: objectPath });

    const { data: removed } = await finance.storage
      .from(DOCUMENTS_BUCKET)
      .remove([objectPath]);
    expect(removed ?? []).toEqual([]);
    expect(await canRead(finance, objectPath)).toBe(true);
  });

  test("refuses a link and a path together", async () => {
    const { error: expenseError } = await insertExpense(finance, {
      receipt_url: "https://example.com/receipt.pdf",
      receipt_path: path(tenantId, "receipts"),
    });
    expect(expenseError?.message).toContain("event_expenses_one_receipt");

    const { error: reimbursementError } = await insertReimbursement(finance, {
      receipt_url: "https://example.com/receipt.pdf",
      receipt_path: path(tenantId, "receipts"),
    });
    expect(reimbursementError?.message).toContain("reimbursements_one_receipt");
  });

  test("refuses another tenant's path or another module's", async () => {
    for (const receiptPath of [
      path(otherTenantId, "receipts"),
      path(tenantId, "governance"),
    ]) {
      const { error } = await insertExpense(finance, {
        receipt_path: receiptPath,
      });
      expect(error?.message).toContain("event_expenses_receipt_path_in_tenant");
    }
  });
});
