/**
 * First stop in the tab order, so keyboard and switch users can bypass the
 * repeated header nav instead of tabbing through it on every page
 * (WCAG 2.4.1 Bypass Blocks). The target must be focusable -- give it
 * `tabIndex={-1}` -- or focus stays on this link and the jump does nothing.
 *
 * `focus:fixed` rather than `focus:absolute`: the public layout's nearest
 * ancestor is an unpositioned <body>, so an absolutely positioned link would
 * escape to the wrong place there.
 */
export function SkipLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="sr-only rounded-lg bg-[var(--purple)] px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
    >
      Skip to main content
    </a>
  );
}
