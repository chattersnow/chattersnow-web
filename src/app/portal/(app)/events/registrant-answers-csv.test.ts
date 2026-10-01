import { describe, expect, test } from "bun:test";
import {
  csvField,
  registrantAnswersCsv,
  registrantAnswersCsvFilename,
  sharesContact,
  type AnswersCsvQuestion,
  type AnswersCsvRegistration,
} from "./registrant-answers-csv";

const GETTING_THERE: AnswersCsvQuestion = {
  id: "q-getting-there",
  prompt: "Getting there",
  shares_contact: false,
};
const LEAVING_FROM: AnswersCsvQuestion = {
  id: "q-leaving-from",
  prompt: "Leaving from",
  shares_contact: false,
};
const SHARE: AnswersCsvQuestion = {
  id: "q-share",
  prompt: "OK to share my contact details with our partner",
  shares_contact: true,
};

function registration(
  overrides: Partial<AnswersCsvRegistration> = {},
): AnswersCsvRegistration {
  return {
    name: "Jamie Rivera",
    party_size: 2,
    email: "jamie@example.test",
    phone: "555-0100",
    answers: [],
    ...overrides,
  };
}

function lines(csv: string): string[] {
  return csv.split("\r\n").slice(0, -1);
}

describe("csvField", () => {
  test("leaves plain text alone and blanks null", () => {
    expect(csvField("Burlington")).toBe("Burlington");
    expect(csvField(3)).toBe("3");
    expect(csvField(null)).toBe("");
  });

  test("quotes commas, quotes and line breaks", () => {
    expect(csvField("Smith, Jo")).toBe('"Smith, Jo"');
    expect(csvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvField("one\ntwo")).toBe('"one\ntwo"');
    expect(csvField("one\r\ntwo")).toBe('"one\r\ntwo"');
  });

  test("neutralises anything a spreadsheet would run as a formula", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+1 555 0100")).toBe("'+1 555 0100");
    expect(csvField("-5")).toBe("'-5");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("\tx")).toBe("'\tx");
    // Quoted as well when it also needs quoting.
    expect(csvField('=1,"2"')).toBe('"\'=1,""2"""');
  });
});

describe("registrantAnswersCsv", () => {
  test("a column per question, blank where unanswered, no contact columns without a sharing question", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE, LEAVING_FROM],
      [
        registration({
          answers: [
            {
              question_id: GETTING_THERE.id,
              answer_text: "Need a ride",
              value: "opt-ride",
            },
            {
              question_id: LEAVING_FROM.id,
              answer_text: "Burlington, VT",
              value: "Burlington, VT",
            },
          ],
        }),
        registration({ name: "Sam Lee", party_size: 1 }),
      ],
    );

    expect(lines(csv)).toEqual([
      "Name,Party size,Getting there,Leaving from",
      'Jamie Rivera,2,Need a ride,"Burlington, VT"',
      "Sam Lee,1,,",
    ]);
    expect(csv).not.toContain("jamie@example.test");
  });

  test("contact details only on rows that ticked the sharing question", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE, SHARE],
      [
        registration({
          answers: [{ question_id: SHARE.id, answer_text: "Yes", value: true }],
        }),
        registration({
          name: "Declined",
          email: "declined@example.test",
          phone: "555-0199",
          answers: [{ question_id: SHARE.id, answer_text: "No", value: false }],
        }),
        registration({
          name: "Never asked",
          email: "never@example.test",
          phone: null,
        }),
      ],
    );

    expect(lines(csv)).toEqual([
      "Name,Party size,Getting there,OK to share my contact details with our partner,Email,Phone",
      "Jamie Rivera,2,,Yes,jamie@example.test,555-0100",
      "Declined,2,,No,,",
      "Never asked,2,,,,",
    ]);
  });

  test("answers to archived questions stay out of the file", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE],
      [
        registration({
          answers: [
            {
              question_id: "q-archived",
              answer_text: "Old answer",
              value: "Old answer",
            },
          ],
        }),
      ],
    );

    expect(csv).not.toContain("Old answer");
  });

  test("escapes names and answers typed by the public", () => {
    const csv = registrantAnswersCsv(
      [LEAVING_FROM],
      [
        registration({
          name: '=cmd|"/c calc"!A1',
          answers: [
            {
              question_id: LEAVING_FROM.id,
              answer_text: "Main St\nApt 2",
              value: "Main St\nApt 2",
            },
          ],
        }),
      ],
    );

    expect(csv).toContain('"\'=cmd|""/c calc""!A1",2,"Main St\nApt 2"');
  });
});

describe("sharesContact", () => {
  test("a declined sharing question beats a ticked one", () => {
    const second = { ...SHARE, id: "q-share-2" };
    expect(
      sharesContact(
        [SHARE, second],
        registration({
          answers: [
            { question_id: SHARE.id, answer_text: "Yes", value: true },
            { question_id: second.id, answer_text: "No", value: false },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("registrantAnswersCsvFilename", () => {
  test("slugs the event name to ASCII", () => {
    expect(
      registrantAnswersCsvFilename("Café Night: Spring!", "2026-10-01"),
    ).toBe("cafe-night-spring-answers-2026-10-01.csv");
    expect(registrantAnswersCsvFilename("★★★", "2026-10-01")).toBe(
      "event-answers-2026-10-01.csv",
    );
  });
});
