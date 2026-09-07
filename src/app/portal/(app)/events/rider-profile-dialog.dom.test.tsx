import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  EventRegistrant,
  RegistrantActionResult,
} from "./registrants-actions";
import * as RegistrantsActions from "./registrants-actions";

const setRegistrantRiderProfileActionMock = mock<
  (
    registrationId: string,
    formData: FormData,
  ) => Promise<RegistrantActionResult>
>(async () => ({ success: true }));

mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  setRegistrantRiderProfileAction: setRegistrantRiderProfileActionMock,
}));

const { RiderProfileDialog } = await import("./rider-profile-dialog");

function registrant(
  rider: Partial<NonNullable<EventRegistrant["rider"]>> = {},
): EventRegistrant {
  return {
    id: "reg-1",
    event_id: "event-1",
    name: "Jamie Rivera",
    email: "jamie@example.test",
    phone: null,
    pronouns: null,
    party_size: 1,
    notes: null,
    created_at: "2026-08-01T12:00:00Z",
    person_id: "person-1",
    checked_in_at: null,
    rider: {
      riding_discipline_at_event: null,
      ski_experience_level_at_event: null,
      snowboard_experience_level_at_event: null,
      riding_discipline: null,
      ski_experience_level: null,
      snowboard_experience_level: null,
      preferred_mountain: null,
      ...rider,
    },
  };
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: string,
  optionName: string,
) {
  await user.click(screen.getByRole("combobox", { name: triggerName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("RiderProfileDialog", () => {
  beforeEach(() => {
    setRegistrantRiderProfileActionMock.mockClear();
    setRegistrantRiderProfileActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("asks for a level only for the discipline they ride", async () => {
    const user = userEvent.setup();
    render(
      <RiderProfileDialog
        registrant={registrant()}
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
      />,
    );

    await chooseOption(user, "Do they ski or ride?", "Snowboard");

    expect(
      screen.queryByRole("combobox", { name: "Experience on skis" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Experience on a snowboard" }),
    ).toBeInTheDocument();
  });

  test("seeds from the person's current profile", () => {
    render(
      <RiderProfileDialog
        registrant={registrant({
          riding_discipline: "ski",
          ski_experience_level: "beginner",
        })}
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Experience on skis" }),
    ).toBeInTheDocument();
  });

  test("saves the answers and closes", async () => {
    const user = userEvent.setup();
    let open = true;
    render(
      <RiderProfileDialog
        registrant={registrant()}
        open
        onOpenChange={(next) => {
          open = next;
        }}
        onSaved={() => {}}
      />,
    );

    await chooseOption(user, "Do they ski or ride?", "Skis");
    await chooseOption(user, "Experience on skis", "Beginner");
    await user.click(
      screen.getByRole("button", { name: "Save rider profile" }),
    );

    expect(setRegistrantRiderProfileActionMock).toHaveBeenCalledTimes(1);
    const [registrationId, formData] =
      setRegistrantRiderProfileActionMock.mock.calls[0];
    expect(registrationId).toBe("reg-1");
    expect(formData.get("ridingDiscipline")).toBe("ski");
    expect(formData.get("skiExperienceLevel")).toBe("beginner");
    expect(open).toBe(false);
  });

  test("keeps the dialog open and shows the failure inline", async () => {
    const user = userEvent.setup();
    setRegistrantRiderProfileActionMock.mockImplementation(async () => ({
      error: "That registration no longer exists.",
    }));
    let open = true;
    render(
      <RiderProfileDialog
        registrant={registrant()}
        open
        onOpenChange={(next) => {
          open = next;
        }}
        onSaved={() => {}}
      />,
    );

    await chooseOption(user, "Do they ski or ride?", "Skis");
    await chooseOption(user, "Experience on skis", "Beginner");
    await user.click(
      screen.getByRole("button", { name: "Save rider profile" }),
    );

    expect(
      await screen.findByText("That registration no longer exists."),
    ).toBeInTheDocument();
    expect(open).toBe(true);
  });
});
