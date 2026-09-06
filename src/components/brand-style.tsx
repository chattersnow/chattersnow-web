import { brandingCss, type Branding } from "@/lib/branding";

/**
 * Applies a tenant's branding over the stylesheet. Renders nothing for a
 * tenant that has set no tokens, so Chatter Snow's own site carries no
 * extra style element at all.
 *
 * The body is built by `brandingCss`, which only ever interpolates values
 * that passed the hex-colour check -- that is the guarantee this element
 * relies on, since a `<style>` is otherwise an injection surface.
 */
export function BrandStyle({ branding }: { branding: Branding }) {
  const css = brandingCss(branding);
  if (!css) return null;
  return <style id="tenant-branding">{css}</style>;
}
