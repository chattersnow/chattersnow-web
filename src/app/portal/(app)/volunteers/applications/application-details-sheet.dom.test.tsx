// #1669: the application sheet says who is working the application, and only
// a volunteers manager gets the controls to change it.
import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";

const nextNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...nextNavigation,
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  }),
}));
mock.module("server-only", () => ({}));

const { VolunteerApplicationDetailsSheet } =
  await import("./application-details-sheet");
import type { VolunteerApplication } from "./application-types";

const application: VolunteerApplication = {
  id: "11111111-1111-4111-8111-111111111111",
  person_id: null,
  name: "Priya Nandakumar",
  email: "priya.n@example.test",
  phone: null,
  pronouns: null,
  role_interest: null,
  availability: null,
  status: "being reviewed",
  created_at: "2026-10-01T15:00:00Z",
  claimant: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Dana Whitfield",
    preferred_name: null,
  },
};

function renderSheet(canManage: boolean) {
  render(
    <VolunteerApplicationDetailsSheet
      application={application}
      canManage={canManage}
      claim={{
        queue: "volunteer_applications",
        itemId: application.id,
        itemLabel: `Application from ${application.name}`,
        claimant: application.claimant,
        myPersonId: "33333333-3333-4333-8333-333333333333",
        canClaim: canManage,
        canAssign: canManage,
        resolved: false,
        staff: [],
      }}
      messages={[]}
      messageActors={[]}
      orgName="Chatter Snow"
      replyTo={null}
      orgEmailEnabled={false}
      canViewScreening={false}
      screenings={[]}
      screeningToday="2026-10-22"
      defaultOpen
      withTrigger={false}
    />,
  );
}

const claimButton = () =>
  screen.queryByRole("button", {
    name: "Claim options for Application from Priya Nandakumar",
  });

describe("VolunteerApplicationDetailsSheet claim", () => {
  test("a view-only reader sees the claimant but no claim controls", () => {
    renderSheet(false);
    expect(screen.getByText("Claimed by")).toBeTruthy();
    expect(screen.getByText("Dana Whitfield")).toBeTruthy();
    expect(claimButton()).toBeNull();
  });

  test("a volunteers manager gets the claim controls", () => {
    renderSheet(true);
    expect(screen.getByText("Dana Whitfield")).toBeTruthy();
    expect(claimButton()).toBeTruthy();
  });
});
