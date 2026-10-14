import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// happy-dom 20.12 implements the Web Animations API, so base-ui now waits on
// `getAnimations()` before unmounting a closed panel or popup -- and nothing
// ever finishes in a DOM with no rendering. base-ui's own switch restores what
// the tests were written against: no exit animation, unmount at once.
(
  globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }
).BASE_UI_ANIMATIONS_DISABLED = true;
