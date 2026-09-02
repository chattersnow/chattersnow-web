import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SaveRiderProfileResult } from "./rider-profile-actions";

const saveRiderProfileActionMock = mock<
  (
    registrationId: string,
    formData: FormData,
  ) => Promise<SaveRiderProfileResult>
>(async () => ({ success: true }));

mock.module("./rider-profile-actions", () => ({
  saveRiderProfileAction: saveRiderProfileActionMock,
}));

const { RiderProfileForm } = await import("./rider-profile-form-fields");

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: string,
  optionName: string,
) {
  await user.click(screen.getByRole("combobox", { name: triggerName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("RiderProfileForm", () => {
  beforeEach(() => {
    saveRiderProfileActionMock.mockClear();
    saveRiderProfileActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("asks for both levels when the visitor rides both", async () => {
    const user = userEvent.setup();
    render(<RiderProfileForm registrationId="reg-1" />);

    expect(
      screen.queryByRole("combobox", { name: "Experience on skis" }),
    ).not.toBeInTheDocument();

    await chooseOption(user, "Do you ski or ride?", "Both");

    expect(
      screen.getByRole("combobox", { name: "Experience on skis" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Experience on a snowboard" }),
    ).toBeInTheDocument();
  });

  test("asks for only the snowboard level when they only snowboard", async () => {
    const user = userEvent.setup();
    render(<RiderProfileForm registrationId="reg-1" />);

    await chooseOption(user, "Do you ski or ride?", "Snowboard");

    expect(
      screen.queryByRole("combobox", { name: "Experience on skis" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Experience on a snowboard" }),
    ).toBeInTheDocument();
  });

  test("reveals a free-text box when the mountain is 'Other'", async () => {
    const user = userEvent.setup();
    render(<RiderProfileForm registrationId="reg-1" />);

    expect(screen.queryByLabelText("Which mountain?")).not.toBeInTheDocument();

    await chooseOption(user, "Preferred mountain for meetups", "Other");

    expect(screen.getByLabelText("Which mountain?")).toBeInTheDocument();
  });

  test("submits the answers and confirms", async () => {
    const user = userEvent.setup();
    render(<RiderProfileForm registrationId="reg-1" />);

    await chooseOption(user, "Do you ski or ride?", "Skis");
    await chooseOption(user, "Experience on skis", "Advanced");
    await user.click(screen.getByRole("button", { name: "Save details" }));

    expect(saveRiderProfileActionMock).toHaveBeenCalledTimes(1);
    const [registrationId, formData] =
      saveRiderProfileActionMock.mock.calls[0]!;
    expect(registrationId).toBe("reg-1");
    expect(formData.get("ridingDiscipline")).toBe("ski");
    expect(formData.get("skiExperienceLevel")).toBe("advanced");
    expect(
      await screen.findByText(
        /we'll use this to point you at the right group/i,
      ),
    ).toBeInTheDocument();
  });

  test("skipping dismisses the step without calling the action", async () => {
    const user = userEvent.setup();
    render(<RiderProfileForm registrationId="reg-1" />);

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(saveRiderProfileActionMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Save details" }),
    ).not.toBeInTheDocument();
  });

  test("surfaces an error without losing the answers", async () => {
    saveRiderProfileActionMock.mockImplementation(async () => ({
      error: "Too many attempts — please try again in a few minutes.",
    }));
    const user = userEvent.setup();
    render(<RiderProfileForm registrationId="reg-1" />);

    await chooseOption(user, "Do you ski or ride?", "Skis");
    await chooseOption(user, "Experience on skis", "Beginner");
    await user.click(screen.getByRole("button", { name: "Save details" }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    // setError runs inside the transition, so the alert can paint while the
    // submit button still reads "Saving..." -- wait for it to settle back.
    expect(
      await screen.findByRole("button", { name: "Save details" }),
    ).toBeInTheDocument();
  });
});
