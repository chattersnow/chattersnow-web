import {
  applyAutoReplyCopy,
  autoReplyDefaults,
  autoReplyDefinition,
  type AutoReplyCopy,
  type AutoReplyDefinition,
} from "@/lib/notifications/auto-replies";

/**
 * How one tenant's resolved copy (#1233) becomes the parts of an email
 * (#1234): where the escaping happens, and how a slot the tenant blanked
 * disappears instead of leaving a hole.
 *
 * The three receipts share this rather than each growing their own copy, the
 * way each grew its own escapeHtml before. #1237 adds two more replies that
 * want exactly the same four helpers.
 *
 * No runtime imports beyond the registry, which has none itself -- the
 * preview (#1236) renders from a client-side action and reaches this file
 * through the renderers.
 */

/**
 * The registry entry a renderer is the reason for.
 *
 * Throws rather than returning undefined: every caller passes a key this
 * repository ships, so a miss is a typo in platform code, and each renderer
 * resolves its definition once at module scope -- which turns that typo into
 * an import-time failure that the first test to load the file catches, rather
 * than an email that silently goes out with every slot empty.
 */
export function requireAutoReplyDefinition(kind: string): AutoReplyDefinition {
  const definition = autoReplyDefinition(kind);
  if (!definition) {
    throw new Error(
      `[notifications] no auto-reply is registered under "${kind}"`,
    );
  }
  return definition;
}

/**
 * What this email actually says: the tenant's slots where they wrote any, the
 * platform's wording where they did not, tokens substituted into plain text.
 *
 * `copy` is absent for a caller with no tenant row in hand -- a test, and the
 * renderers' own default -- and that is the same thing the resolver returns
 * for a tenant who has never opened the editor, so the two paths cannot drift.
 */
export function autoReplyWords(
  definition: AutoReplyDefinition,
  copy: AutoReplyCopy | undefined,
  values: Record<string, string | null | undefined>,
): AutoReplyCopy {
  return applyAutoReplyCopy(
    definition,
    copy ?? autoReplyDefaults(definition),
    values,
  );
}

/**
 * Escaped once, at the point the HTML part is composed.
 *
 * Slot text and token values are both plain text from somewhere untrusted --
 * an administrator typed one into the editor and a member of the public typed
 * the other into a form -- and they are substituted into each other as plain
 * text first (applyAutoReplyTokens). Escaping either of them earlier would
 * show a reader `&amp;` where they wrote `&`. The text part is never escaped
 * at all.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * One tenant paragraph as a `<p>`, or nothing at all when they blanked the
 * slot -- an empty `<p>` would leave a gap where a sentence used to be, and
 * blanking a slot is how a tenant removes it.
 *
 * `style` is the paragraph's own, so each renderer keeps the margins it had.
 */
export function copyParagraphHtml(text: string, style: string): string | null {
  if (!text) return null;
  // Somebody who typed line breaks into a 1000-character field meant them.
  // Added only where there are any, so a single-paragraph slot -- which every
  // platform default is -- renders byte-identically to the fixed English it
  // replaced.
  const declarations = text.includes("\n")
    ? `${style} white-space: pre-line;`
    : style;
  return `  <p style="${declarations}">${escapeHtml(text)}</p>`;
}

/**
 * The text part: blocks separated by one blank line, with anything empty left
 * out rather than contributing a blank line of its own.
 *
 * A block may hold its own newlines -- the event's detail rows sit against
 * their intro with no blank line between them.
 */
export function joinTextBlocks(blocks: (string | null | undefined)[]): string {
  return blocks.filter((block): block is string => Boolean(block)).join("\n\n");
}

/** The lines of an HTML part inside the shell, with the blanked slots gone. */
export function joinHtmlLines(lines: (string | null | undefined)[]): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
