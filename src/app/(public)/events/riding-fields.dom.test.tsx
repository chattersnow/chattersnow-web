import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  EMPTY_RIDING,
  RidingFields,
  ridingSummaryRows,
  ridingValuesFromPerson,
  setRidingFields,
  type RidingValues,
} from "./riding-fields";

// A tenant's own list (#1408), deliberately not Chatter Snow's: the fields
// must offer whatever they are handed and nothing they were not.
const MOUNTAINS = ["Whistler", "Mount Hood"];

function Harness({ initial = EMPTY_RIDING }: { initial?: RidingValues }) {
  const [values, setValues] = useState(initial);
  return (
    <RidingFields
      idPrefix="test"
      mountains={MOUNTAINS}
      values={values}
      onChange={setValues}
    />
  );
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: string | RegExp,
  optionName: string,
) {
  await user.click(screen.getByRole("combobox", { name: triggerName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("RidingFields", () => {
  test("asks for both levels when the registrant rides both", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(
      screen.queryByRole("combobox", { name: /Experience on skis/ }),
    ).not.toBeInTheDocument();

    await chooseOption(user, /Do you ski or snowboard/, "Both");

    expect(
      screen.getByRole("combobox", { name: /Experience on skis/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Experience on a snowboard/ }),
    ).toBeInTheDocument();
  });

  test("asks for only the snowboard level when they only snowboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await chooseOption(user, /Do you ski or snowboard/, "Snowboard");

    expect(
      screen.queryByRole("combobox", { name: /Experience on skis/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Experience on a snowboard/ }),
    ).toBeInTheDocument();
  });

  test("offers the organization's own mountains, then Other with a box", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Home mountain" }));
    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual([...MOUNTAINS, "Other"]);

    await user.click(screen.getByRole("option", { name: "Other" }));
    expect(screen.getByLabelText("Which mountain?")).toBeInTheDocument();
  });

  test("starts from the values it is given", () => {
    render(
      <Harness
        initial={{
          ...EMPTY_RIDING,
          discipline: "ski",
          skiLevel: "advanced",
          mountain: "Whistler",
        }}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: /Do you ski or snowboard/ }),
    ).toHaveTextContent("Skis");
    expect(
      screen.getByRole("combobox", { name: /Experience on skis/ }),
    ).toHaveTextContent("Advanced");
  });
});

describe("ridingValuesFromPerson", () => {
  const person = {
    riding_discipline: "both" as const,
    ski_experience_level: "beginner" as const,
    snowboard_experience_level: "advanced" as const,
    preferred_mountain: "Whistler",
  };

  test("picks a listed mountain", () => {
    expect(ridingValuesFromPerson(person, MOUNTAINS)).toEqual({
      discipline: "both",
      skiLevel: "beginner",
      snowboardLevel: "advanced",
      mountain: "Whistler",
      otherMountain: "",
    });
  });

  test("puts an unlisted mountain under Other, typed in", () => {
    expect(
      ridingValuesFromPerson(
        { ...person, preferred_mountain: "Jay Peak" },
        MOUNTAINS,
      ),
    ).toMatchObject({ mountain: "Other", otherMountain: "Jay Peak" });
  });

  test("is empty for a person with no answers", () => {
    expect(
      ridingValuesFromPerson(
        {
          riding_discipline: null,
          ski_experience_level: null,
          snowboard_experience_level: null,
          preferred_mountain: null,
        },
        MOUNTAINS,
      ),
    ).toEqual(EMPTY_RIDING);
  });
});

describe("ridingSummaryRows and setRidingFields", () => {
  const values: RidingValues = {
    discipline: "snowboard",
    // A level left over from answering "Both" first is not what they ride.
    skiLevel: "beginner",
    snowboardLevel: "intermediate",
    mountain: "Other",
    otherMountain: " Jay Peak ",
  };

  test("summarises only what applies", () => {
    expect(ridingSummaryRows(values)).toEqual([
      { label: "Skis or snowboard", value: "Snowboard" },
      { label: "Experience on a snowboard", value: "Intermediate" },
      { label: "Home mountain", value: "Jay Peak" },
    ]);
    expect(ridingSummaryRows(EMPTY_RIDING)).toEqual([]);
  });

  test("marks the questions as asked", () => {
    const fd = new FormData();
    setRidingFields(fd, values);
    expect(fd.get("ridingAsked")).toBe("on");
    expect(fd.get("ridingDiscipline")).toBe("snowboard");
    expect(fd.get("otherMountain")).toBe(" Jay Peak ");
  });
});
