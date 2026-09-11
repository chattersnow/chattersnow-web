import { afterEach, expect, mock, setDefaultTimeout } from "bun:test";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);
afterEach(cleanup);

// Bun's 5s default is sized for pure-logic tests. A DOM test that renders a
// React tree, drives it through userEvent and then polls with waitFor runs
// several times slower on a CI runner under `--coverage` than it does locally
// -- content-editor.dom.test.tsx's "saving stores a draft" case takes ~0.2s
// here and has hit the 5s wall twice on CI, on `development` as well as on a
// PR branch. The work is bounded either way, so the deadline only needs to be
// far enough out that a slow machine is not mistaken for a hung test.
setDefaultTimeout(20_000);

// Client components can call these hooks outside of a real Next.js router
// (e.g. useRouter() at the top of a dialog that's currently closed), so give
// every DOM test a harmless default. Override with a per-file mock.module
// call (before importing the component under test) when a test needs to
// assert on navigation.
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: () => {},
  permanentRedirect: () => {},
  notFound: () => {},
}));
