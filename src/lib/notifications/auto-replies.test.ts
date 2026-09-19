import { describe, expect, test } from "bun:test";
import {
  AUTO_REPLIES,
  AUTO_REPLY_LINE_MAX_LENGTH,
  AUTO_REPLY_PARAGRAPH_MAX_LENGTH,
  AUTO_REPLY_SLOT_KEYS,
  applyAutoReplyCopy,
  applyAutoReplyTokens,
  autoReplyDefaults,
  autoReplyDefinition,
  mergeAutoReplySlots,
  validateAutoReplySlots,
} from "./auto-replies";
import { isNotificationKind } from "./kinds";

const EVENT = autoReplyDefinition("event_registration_confirmation")!;
const VOLUNTEER = autoReplyDefinition("volunteer_application_confirmation")!;

describe("the registry", () => {
  test("every reply offers the same five slots, in order", () => {
    for (const definition of AUTO_REPLIES) {
      expect(definition.slots.map((slot) => slot.key)).toEqual([
        ...AUTO_REPLY_SLOT_KEYS,
      ]);
    }
  });

  test("every reply names a real notification kind", () => {
    // The per-person opt-out still governs an auto-reply, so a kind spelled
    // wrong here would be a switch on /my that changes nothing.
    for (const definition of AUTO_REPLIES) {
      expect(isNotificationKind(definition.notificationKind)).toBe(true);
    }
  });

  test("a slot's length limit matches its shape", () => {
    for (const slot of AUTO_REPLIES.flatMap((d) => d.slots)) {
      expect(slot.maxLength).toBe(
        slot.shape === "line"
          ? AUTO_REPLY_LINE_MAX_LENGTH
          : AUTO_REPLY_PARAGRAPH_MAX_LENGTH,
      );
    }
  });

  test("every default fits the limit it is offered under", () => {
    for (const slot of AUTO_REPLIES.flatMap((d) => d.slots)) {
      expect(slot.default.length).toBeLessThanOrEqual(slot.maxLength);
    }
  });

  test("a default only uses tokens its own slot allows", () => {
    // A default carrying a token the editor would reject is one an
    // administrator could never retype after changing their mind.
    for (const slot of AUTO_REPLIES.flatMap((d) => d.slots)) {
      for (const [, token] of slot.default.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
        expect(slot.tokens as string[]).toContain(token);
      }
    }
  });

  test("the preview sample answers for every token a reply offers", () => {
    for (const definition of AUTO_REPLIES) {
      for (const token of new Set(definition.slots.flatMap((s) => s.tokens))) {
        expect(definition.sample[token]).toBeTruthy();
      }
    }
  });

  test("the defaults are today's wording", () => {
    // These three strings are what the renderers hard-code today (#1068,
    // #1069, #1032). #1234 asserts the whole email byte-for-byte; this is the
    // copy those assertions rest on.
    expect(autoReplyDefaults(EVENT).intro).toBe(
      "You're registered for {{event_name}}. Here are the details:",
    );
    expect(autoReplyDefaults(VOLUNTEER).subject).toBe(
      "Your application — {{org_name}}",
    );
    expect(
      autoReplyDefaults(autoReplyDefinition("gear_request_confirmation")!)
        .intro,
    ).toBe(
      "Thanks for your request. These items are now on hold for you and no longer available to others:",
    );
  });

  test("an unregistered kind resolves to nothing", () => {
    expect(autoReplyDefinition("no_such_reply")).toBeUndefined();
  });
});

describe("mergeAutoReplySlots", () => {
  test("no saved row leaves every slot on the platform default", () => {
    expect(mergeAutoReplySlots(EVENT, null)).toEqual(autoReplyDefaults(EVENT));
  });

  test("an absent key is the default and a present empty string is blank", () => {
    // The whole reason `slots` is sparse: improving a default has to reach
    // every tenant who never touched that slot, and a tenant who deliberately
    // blanked one has to stay blank.
    const merged = mergeAutoReplySlots(EVENT, { closing: "" });
    expect(merged.closing).toBe("");
    expect(merged.intro).toBe(autoReplyDefaults(EVENT).intro);
  });

  test("a rewritten slot wins", () => {
    const merged = mergeAutoReplySlots(EVENT, {
      greeting: "Hey {{first_name}}!",
    });
    expect(merged.greeting).toBe("Hey {{first_name}}!");
    expect(merged.subject).toBe(autoReplyDefaults(EVENT).subject);
  });

  test("a non-string value is treated as absent", () => {
    const merged = mergeAutoReplySlots(EVENT, { intro: null, closing: 7 });
    expect(merged.intro).toBe(autoReplyDefaults(EVENT).intro);
    expect(merged.closing).toBe(autoReplyDefaults(EVENT).closing);
  });

  test("a key no slot claims is ignored", () => {
    const merged = mergeAutoReplySlots(EVENT, { footer: "Sent from my phone" });
    expect(merged).toEqual(autoReplyDefaults(EVENT));
  });

  test("something that is not an object at all folds to the defaults", () => {
    expect(mergeAutoReplySlots(EVENT, "wat")).toEqual(autoReplyDefaults(EVENT));
    expect(mergeAutoReplySlots(EVENT, ["wat"])).toEqual(
      autoReplyDefaults(EVENT),
    );
  });
});

describe("applyAutoReplyTokens", () => {
  test("substitutes a value", () => {
    expect(
      applyAutoReplyTokens("Hi {{first_name}},", {
        first_name: "Alexandra Whitfield",
      }),
    ).toBe("Hi Alexandra Whitfield,");
  });

  test("substitutes the same token more than once, with space in the braces", () => {
    expect(
      applyAutoReplyTokens("{{ org_name }} — thanks from {{org_name}}", {
        org_name: "Riverside Community Center",
      }),
    ).toBe(
      "Riverside Community Center — thanks from Riverside Community Center",
    );
  });

  test("an unknown token renders empty", () => {
    expect(applyAutoReplyTokens("Code: {{not_a_token}}", {})).toBe("Code: ");
  });

  test("an empty value renders empty and keeps the rest of the line", () => {
    expect(
      applyAutoReplyTokens("Hi {{first_name}}, from {{org_name}}", {
        first_name: "",
        org_name: "Riverside Community Center",
      }),
    ).toBe("Hi , from Riverside Community Center");
  });

  test("a null or undefined value renders empty", () => {
    expect(
      applyAutoReplyTokens("Hi {{first_name}},", { first_name: null }),
    ).toBe("Hi ,");
    expect(
      applyAutoReplyTokens("Hi {{first_name}},", { first_name: undefined }),
    ).toBe("Hi ,");
  });

  test("the fallback replaces the line when every token resolves empty", () => {
    expect(
      applyAutoReplyTokens("Hi {{first_name}},", { first_name: "" }, "Hi,"),
    ).toBe("Hi,");
  });

  test("the fallback stays out of the way when a token resolves", () => {
    expect(
      applyAutoReplyTokens("Hi {{first_name}},", { first_name: "Alex" }, "Hi,"),
    ).toBe("Hi Alex,");
  });

  test("a slot with no tokens at all never reaches the fallback", () => {
    // Nothing was resolved because there was nothing to resolve. Replacing
    // the tenant's own sentence here would silently discard what they wrote.
    expect(applyAutoReplyTokens("Thanks for signing up.", {}, "Hi,")).toBe(
      "Thanks for signing up.",
    );
  });

  test("text is substituted verbatim, markup included", () => {
    // Escaping happens once, when the HTML part is composed (#1234). Doing it
    // here would show a reader &amp; where they typed &.
    expect(
      applyAutoReplyTokens("From {{org_name}}", {
        org_name: "Ben & Jerry's <script>alert(1)</script>",
      }),
    ).toBe("From Ben & Jerry's <script>alert(1)</script>");
  });
});

describe("applyAutoReplyCopy", () => {
  test("renders every slot with its own fallback", () => {
    const rendered = applyAutoReplyCopy(EVENT, autoReplyDefaults(EVENT), {
      org_name: "Riverside Community Center",
      first_name: "",
      event_name: "Spring Tune-Up Day",
    });

    expect(rendered.subject).toBe("You're registered for Spring Tune-Up Day");
    expect(rendered.greeting).toBe("Hi,");
    expect(rendered.intro).toBe(
      "You're registered for Spring Tune-Up Day. Here are the details:",
    );
    expect(rendered.signoff).toBe("— Riverside Community Center");
  });

  test("a blanked slot stays blank", () => {
    const rendered = applyAutoReplyCopy(
      EVENT,
      mergeAutoReplySlots(EVENT, { closing: "" }),
      EVENT.sample,
    );
    expect(rendered.closing).toBe("");
  });
});

describe("validateAutoReplySlots (#1235)", () => {
  test("says nothing about slots the tenant has not rewritten", () => {
    // The sparse object is the input on purpose: a slot still on the
    // platform's wording cannot be wrong, and validating the merged copy
    // would make every default answerable to rules written for tenant text.
    expect(validateAutoReplySlots(EVENT, {})).toEqual([]);
  });

  test("names the slot when a token is misspelled", () => {
    const [problem] = validateAutoReplySlots(EVENT, {
      greeting: "Hi {{first_nmae}},",
    });
    expect(problem.slot).toBe("greeting");
    expect(problem.message).toContain("Greeting");
    expect(problem.message).toContain("{{first_nmae}}");
    expect(problem.message).toContain("{{first_name}}");
  });

  test("catches a token this slot does not offer", () => {
    // {{reference_code}} is real, and means nothing on an event
    // registration. Rendered it would simply vanish.
    const [problem] = validateAutoReplySlots(EVENT, {
      intro: "Your code is {{reference_code}}.",
    });
    expect(problem.slot).toBe("intro");
    expect(problem.message).toContain("{{reference_code}}");
  });

  test("catches a token the substituting pattern would not even match", () => {
    // TOKEN_PATTERN takes lower case only, so {{First_Name}} renders as
    // itself -- the one failure a reader sees in full.
    const [problem] = validateAutoReplySlots(EVENT, {
      greeting: "Hi {{First_Name}},",
    });
    expect(problem.slot).toBe("greeting");
  });

  test("refuses an empty subject and allows an empty paragraph", () => {
    expect(validateAutoReplySlots(EVENT, { subject: "   " })).toHaveLength(1);
    expect(validateAutoReplySlots(EVENT, { closing: "" })).toEqual([]);
  });

  test("counts characters over the slot's own limit", () => {
    const [problem] = validateAutoReplySlots(EVENT, {
      subject: "x".repeat(AUTO_REPLY_LINE_MAX_LENGTH + 3),
    });
    expect(problem.slot).toBe("subject");
    expect(problem.message).toContain("3 characters over");
  });

  test("a paragraph gets the paragraph limit, not the line one", () => {
    expect(
      validateAutoReplySlots(VOLUNTEER, {
        intro: "x".repeat(AUTO_REPLY_PARAGRAPH_MAX_LENGTH),
      }),
    ).toEqual([]);
  });

  test("blames no slot for a key no slot claims", () => {
    const [problem] = validateAutoReplySlots(EVENT, { footer: "..." });
    expect(problem.slot).toBeNull();
    expect(problem.message).toContain("footer");
  });
});
