import { describe, expect, test } from "bun:test";
import { parseAssetForm } from "./asset-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  name: "  Chatter Snow domain  ",
  service_id: "service-1",
  category: "domain",
  status: "active",
  sensitivity: "high",
  mfa_status: "enabled",
  credential_management_location: "password_manager",
  url: "https://chattersnow.org",
  description: "  Primary domain registration.  ",
  owner_person_id: "person-1",
  primary_admin_person_id: "person-2",
  backup_admin_person_id: "person-3",
  recovery_owner_person_id: "person-4",
  notes: "  Renews each January.  ",
  is_org_owned: "true",
  mfa_required: "true",
  recovery_documented: "true",
};

describe("parseAssetForm", () => {
  test("parses a fully filled form", () => {
    expect(parseAssetForm(formData(validFields))).toEqual({
      data: {
        name: "Chatter Snow domain",
        service_id: "service-1",
        category: "domain",
        description: "Primary domain registration.",
        url: "https://chattersnow.org",
        is_org_owned: true,
        owner_person_id: "person-1",
        primary_admin_person_id: "person-2",
        backup_admin_person_id: "person-3",
        status: "active",
        sensitivity: "high",
        mfa_required: true,
        mfa_status: "enabled",
        recovery_documented: true,
        recovery_owner_person_id: "person-4",
        credential_management_location: "password_manager",
        notes: "Renews each January.",
      },
    });
  });

  test("falls back to the safe defaults when the enum fields are absent", () => {
    const data = formData(validFields);
    for (const key of [
      "status",
      "sensitivity",
      "mfa_status",
      "credential_management_location",
    ]) {
      data.delete(key);
    }
    const result = parseAssetForm(data);
    expect("data" in result && result.data).toMatchObject({
      status: "active",
      sensitivity: "medium",
      mfa_status: "unknown",
      credential_management_location: "unknown",
    });
  });

  test("treats an unchecked box as false", () => {
    const result = parseAssetForm(
      formData({
        ...validFields,
        is_org_owned: "false",
        mfa_required: "off",
        recovery_documented: "",
      }),
    );
    expect("data" in result && result.data).toMatchObject({
      is_org_owned: false,
      mfa_required: false,
      recovery_documented: false,
    });
  });

  test("turns blank optional fields into null", () => {
    const result = parseAssetForm(
      formData({
        ...validFields,
        url: "",
        description: "  ",
        owner_person_id: "",
        primary_admin_person_id: "",
        backup_admin_person_id: "",
        recovery_owner_person_id: "",
        notes: "   ",
      }),
    );
    expect("data" in result && result.data).toMatchObject({
      url: null,
      description: null,
      owner_person_id: null,
      primary_admin_person_id: null,
      backup_admin_person_id: null,
      recovery_owner_person_id: null,
      notes: null,
    });
  });

  test("requires a name", () => {
    expect(parseAssetForm(formData({ ...validFields, name: "   " }))).toEqual({
      error: "Asset name is required.",
    });
  });

  test("requires a service", () => {
    expect(
      parseAssetForm(formData({ ...validFields, service_id: "  " })),
    ).toEqual({ error: "Select a service." });
  });

  test("rejects a missing or unknown category", () => {
    expect(parseAssetForm(formData({ ...validFields, category: "" }))).toEqual({
      error: "Select a valid category.",
    });
    expect(
      parseAssetForm(formData({ ...validFields, category: "spreadsheet" })),
    ).toEqual({ error: "Select a valid category." });
  });

  test("rejects an unknown status", () => {
    expect(
      parseAssetForm(formData({ ...validFields, status: "archived" })),
    ).toEqual({ error: "Select a valid status." });
  });

  test("rejects an unknown sensitivity", () => {
    expect(
      parseAssetForm(formData({ ...validFields, sensitivity: "extreme" })),
    ).toEqual({ error: "Select a valid sensitivity." });
  });

  test("rejects an unknown MFA status", () => {
    expect(
      parseAssetForm(formData({ ...validFields, mfa_status: "partial" })),
    ).toEqual({ error: "Select a valid MFA status." });
  });

  test("rejects an unknown credential management location", () => {
    expect(
      parseAssetForm(
        formData({ ...validFields, credential_management_location: "sticky" }),
      ),
    ).toEqual({ error: "Select a valid credential management location." });
  });

  test("rejects a URL with no http(s) scheme", () => {
    expect(
      parseAssetForm(formData({ ...validFields, url: "chattersnow.org" })),
    ).toEqual({ error: "URL must start with http:// or https://." });
    expect(
      parseAssetForm(formData({ ...validFields, url: "javascript:alert(1)" })),
    ).toEqual({ error: "URL must start with http:// or https://." });
  });

  test("accepts an uppercase URL scheme", () => {
    const result = parseAssetForm(
      formData({ ...validFields, url: "HTTPS://chattersnow.org" }),
    );
    expect("data" in result && result.data.url).toBe("HTTPS://chattersnow.org");
  });
});
