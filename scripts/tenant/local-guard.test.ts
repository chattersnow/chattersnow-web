import { describe, expect, test } from "bun:test";
import { LocalStackError, guardLocalStack, isLocalStack } from "./local-guard";

const LOCAL = "http://127.0.0.1:54321";
const HOSTED = "https://abcdefghijklmnop.supabase.co";

const input = {
  creates: "A second tenant",
  undo: "`bun run tenant:archive x` then `bun run tenant:delete x --confirm x`",
};

describe("isLocalStack", () => {
  test("recognises both spellings of the local stack", () => {
    expect(isLocalStack(LOCAL)).toBe(true);
    expect(isLocalStack("http://localhost:54321")).toBe(true);
  });

  test("a hosted project is not local", () => {
    expect(isLocalStack(HOSTED)).toBe(false);
  });
});

describe("guardLocalStack", () => {
  test("refuses the local stack without --local, naming the flag and the way back", () => {
    expect(() =>
      guardLocalStack({ ...input, url: LOCAL, local: false }),
    ).toThrow(LocalStackError);
    expect(() =>
      guardLocalStack({ ...input, url: LOCAL, local: false }),
    ).toThrow(
      /sole-active-tenant fallback[\s\S]*Pass --local[\s\S]*tenant:archive/,
    );
  });

  test("goes ahead on the local stack with --local, with a warning that names the way back", () => {
    const warning = guardLocalStack({ ...input, url: LOCAL, local: true });
    expect(warning).toMatch(/LOCAL stack/);
    expect(warning).toMatch(/test:integration/);
    expect(warning).toContain(input.undo);
  });

  // The inverse is a mistake worth failing on too: --local against a real
  // project means the operator thinks they are somewhere they are not.
  test("refuses --local against a hosted project", () => {
    expect(() =>
      guardLocalStack({ ...input, url: HOSTED, local: true }),
    ).toThrow(/not a local stack/);
  });

  test("says nothing about a hosted project without --local", () => {
    expect(guardLocalStack({ ...input, url: HOSTED, local: false })).toBeNull();
  });
});
