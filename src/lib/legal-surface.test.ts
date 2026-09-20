import { describe, expect, test } from "bun:test";
import {
  collectionSurface,
  surfaceKeys,
  SURFACE_GATES,
  type CollectionSurface,
} from "@/lib/legal-surface";
import { PUBLIC_PAGE_SLOTS } from "@/lib/page-visibility";

const ALL_OFF: Record<string, boolean> = {
  contact: false,
  "get-involved-volunteer": false,
  events: false,
  gears: false,
};

const NO_MODULES: Record<string, boolean> = {
  communications: false,
  volunteers: false,
  events: false,
  inventory: false,
  artwork: false,
  constituent_accounts: false,
};

describe("collectionSurface", () => {
  // The direction that matters: a tenant nobody has configured yet, or one
  // whose configuration could not be read, keeps every bullet. Over-describing
  // what you collect is survivable; under-describing it is not.
  test("fails open on empty maps", () => {
    expect(collectionSurface({}, {})).toEqual({
      contact: true,
      volunteerApplications: true,
      eventRegistrations: true,
      gearRequests: true,
      artworkSubmissions: true,
      constituentAccounts: true,
      volunteerHours: true,
      googleSignIn: true,
    });
  });

  test("a hidden page turns its surface off", () => {
    const surface = collectionSurface(ALL_OFF, {});
    expect(surface.contact).toBe(false);
    expect(surface.volunteerApplications).toBe(false);
    expect(surface.eventRegistrations).toBe(false);
    expect(surface.gearRequests).toBe(false);
    // No slot behind these, so page visibility has nothing to say.
    expect(surface.artworkSubmissions).toBe(true);
    expect(surface.constituentAccounts).toBe(true);
    expect(surface.volunteerHours).toBe(true);
  });

  // The public volunteer page and self-logged hours share a module but not a
  // slot: `log_my_volunteer_hours()` checks only the module, so hiding the page
  // takes the application form away and leaves the hours form standing.
  test("hiding the volunteer page does not take self-logged hours with it", () => {
    const surface = collectionSurface({ "get-involved-volunteer": false }, {});
    expect(surface.volunteerApplications).toBe(false);
    expect(surface.volunteerHours).toBe(true);
  });

  // #1296. The form that logs hours is in `/my`, so the Volunteers module
  // alone does not mean a tenant collects self-logged hours -- and since the
  // retention table filters its clock on this key, a surface that said
  // otherwise would publish a period for data the tenant cannot receive.
  test("self-logged hours need the constituent area, not just the module", () => {
    const surface = collectionSurface({}, { constituent_accounts: false });
    expect(surface.constituentAccounts).toBe(false);
    expect(surface.volunteerHours).toBe(false);
  });

  // `getTenantPageVisibility()`, which the Site Content editor's starter is
  // built from, reads app_settings directly and does not fold the entitlement
  // in the way its public counterpart does. So the module has to be checked
  // here, not assumed to have been checked already.
  test("a disabled module turns its surface off whatever the board stored", () => {
    const everythingShown = {
      contact: true,
      "get-involved-volunteer": true,
      events: true,
      gears: true,
    };
    expect(collectionSurface(everythingShown, NO_MODULES)).toEqual({
      contact: false,
      volunteerApplications: false,
      eventRegistrations: false,
      gearRequests: false,
      artworkSubmissions: false,
      constituentAccounts: false,
      volunteerHours: false,
      googleSignIn: true,
    });
  });

  // The button in src/app/portal/login/login-form.tsx is unconditional, so the
  // subprocessor bullet is too. If this ever fails, the policy needs a real
  // signal rather than a constant.
  test("Google sign-in is on for every tenant, because the button is", () => {
    expect(collectionSurface(ALL_OFF, NO_MODULES).googleSignIn).toBe(true);
  });
});

// The gate table duplicates what PUBLIC_PAGE_SLOTS already says, because
// legal-surface must stay importable from client code. This is what stops the
// copy drifting.
describe("SURFACE_GATES", () => {
  test("every slot it names is registered, with the same module", () => {
    for (const [surface, gate] of Object.entries(SURFACE_GATES)) {
      if (gate.slot === null) continue;
      const slot = PUBLIC_PAGE_SLOTS.find(
        (candidate) => candidate.key === gate.slot,
      );
      expect(slot, `${surface} -> ${gate.slot}`).toBeDefined();
      expect(slot!.module, `${surface} -> ${gate.slot}`).toBe(gate.module);
    }
  });

  test("there is a gate for every surface but Google sign-in", () => {
    const surfaces = Object.keys(collectionSurface({}, {})).filter(
      (key) => key !== "googleSignIn",
    );
    expect(Object.keys(SURFACE_GATES).sort()).toEqual(surfaces.sort());
  });
});

describe("surfaceKeys", () => {
  test("lists what is on, sorted", () => {
    const surface: CollectionSurface = {
      contact: true,
      volunteerApplications: false,
      eventRegistrations: true,
      gearRequests: false,
      artworkSubmissions: false,
      constituentAccounts: false,
      volunteerHours: false,
      googleSignIn: true,
    };
    expect(surfaceKeys(surface)).toEqual([
      "contact",
      "eventRegistrations",
      "googleSignIn",
    ]);
  });

  test("is empty when nothing is collected", () => {
    expect(
      surfaceKeys({
        contact: false,
        volunteerApplications: false,
        eventRegistrations: false,
        gearRequests: false,
        artworkSubmissions: false,
        constituentAccounts: false,
        volunteerHours: false,
        googleSignIn: false,
      }),
    ).toEqual([]);
  });
});
