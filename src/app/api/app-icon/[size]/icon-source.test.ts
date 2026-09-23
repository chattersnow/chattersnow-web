import { afterEach, describe, expect, mock, test } from "bun:test";
import { loadRemoteIcon } from "./icon-source";

const realFetch = globalThis.fetch;
const BASE = "https://www.example.org/api/app-icon/192";

/** Stubs `fetch` with one PNG response and records the URL it was asked for. */
function stubFetch(type = "image/png") {
  const calls: string[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": type },
    });
  }) as unknown as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("loadRemoteIcon", () => {
  test("returns null when nothing is uploaded", async () => {
    expect(await loadRemoteIcon(null, BASE)).toBeNull();
  });

  // The branding panel accepts a `public/` path for the icon, as it does for
  // the logo; parsing it without a base threw and fell back to initials.
  test("fetches a root-relative path from the requesting host", async () => {
    const calls = stubFetch();
    const icon = await loadRemoteIcon("/icon.png", BASE);
    expect(calls).toEqual(["https://www.example.org/icon.png"]);
    expect(icon).toBe("data:image/png;base64,AQID");
  });

  test("fetches an absolute URL as given", async () => {
    const calls = stubFetch();
    await loadRemoteIcon("https://cdn.example.com/a.png", BASE);
    expect(calls).toEqual(["https://cdn.example.com/a.png"]);
  });

  test("refuses a non-http scheme", async () => {
    const calls = stubFetch();
    expect(await loadRemoteIcon("data:image/png;base64,AQID", BASE)).toBeNull();
    expect(calls).toEqual([]);
  });

  test("refuses a type Satori is not trusted with", async () => {
    stubFetch("image/svg+xml");
    expect(await loadRemoteIcon("/icon.svg", BASE)).toBeNull();
  });
});
