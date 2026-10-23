import { describe, expect, test } from "bun:test";
import { formAnalyticsConfig } from "@/lib/analytics/form-analytics";

const PRODUCTION = {
  NEXT_PUBLIC_VERCEL_ENV: "production",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
};
const ON = { form_analytics: true };

describe("formAnalyticsConfig", () => {
  test("on for a production deploy with a key and the module", () => {
    expect(formAnalyticsConfig(ON, "demo", PRODUCTION)).toEqual({
      apiKey: "phc_test",
      tenant: "demo",
    });
  });

  test("off anywhere but production", () => {
    for (const env of ["preview", "development", undefined]) {
      expect(
        formAnalyticsConfig(ON, "demo", {
          ...PRODUCTION,
          NEXT_PUBLIC_VERCEL_ENV: env,
        }),
      ).toBeNull();
    }
  });

  test("off without a key or a tenant", () => {
    expect(
      formAnalyticsConfig(ON, "demo", {
        NEXT_PUBLIC_VERCEL_ENV: "production",
      }),
    ).toBeNull();
    expect(formAnalyticsConfig(ON, null, PRODUCTION)).toBeNull();
  });

  test("off when the module is off, and when it could not be read", () => {
    expect(
      formAnalyticsConfig({ form_analytics: false }, "demo", PRODUCTION),
    ).toBeNull();
    expect(formAnalyticsConfig({}, "demo", PRODUCTION)).toBeNull();
  });
});
