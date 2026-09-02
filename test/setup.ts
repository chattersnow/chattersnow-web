import { afterEach, expect, mock } from "bun:test";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);
afterEach(cleanup);

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
