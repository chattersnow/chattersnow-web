/**
 * The RFC 9116 `security.txt` this deployment serves, rendered per tenant.
 *
 * It used to be `public/.well-known/security.txt`, one hand-written file (#975).
 * A static file cannot vary by host, and this deployment answers on every
 * tenant's domain, so that one file published Chatter Snow's board as the
 * disclosure contact -- and Chatter Snow's terms as the governing policy -- on
 * every customer's site. A well-known path is exactly where a researcher or a
 * scanner looks first, so a real report about a real customer's data would have
 * been routed to people with no standing to receive it.
 *
 * Three things follow from being per-tenant, and they are the whole module:
 *
 *   * `Canonical` is built from the origin the request arrived on. RFC 9116
 *     treats a file whose canonical URI is not the one it was fetched from as
 *     invalid, so the static file was formally invalid on `demo.rickiecruz.com`
 *     as well as wrong.
 *   * `Expires` is computed. It is a required field and an expired file is
 *     invalid, so the old one carried a note asking a maintainer to bump it
 *     annually -- a reminder nobody gets. A file that cannot expire needs no
 *     reminder.
 *   * A tenant that has nominated no security contact gets no file at all. An
 *     organization with nowhere to send a report should not be publishing a
 *     document that says where to send one; an absent file is honest, and a
 *     wrong one is not.
 *
 * Pure, and deliberately: everything here is decided from values, so the route
 * handler is a read and a render and the reasoning is unit-tested.
 */

/** The width the comment block wraps at, matching how the old file was written. */
const COMMENT_WIDTH = 76;

export type SecurityTxtInput = {
  /** The organization the file is about, or null when the tenant read failed. */
  organization: string | null;
  /** A contact URI, already through `securityContactUri()`. */
  contact: string;
  /** The tenant's own prose, rendered as the comment block. May be empty. */
  note: readonly string[];
  /** The origin the request arrived on -- what `Canonical` has to match. */
  origin: string;
  /** The tenant's terms, when it has put them in force; omitted otherwise. */
  policyUrl: string | null;
  /** Injected rather than read so `Expires` is testable. */
  now: Date;
};

/**
 * The contact as a URI, or null when it cannot be published.
 *
 * `Contact` is a URI field, so a bare address has to become `mailto:`, and a
 * form or a disclosure page passes through as the `https://` URL it already is.
 * Anything else -- a phone number, a sentence, an empty slot -- returns null,
 * and the caller serves no file rather than an invalid one. That is the same
 * judgement the module header makes about an unset contact: a `security.txt`
 * whose only actionable field is malformed is worse than none.
 *
 * The email test is deliberately loose (one `@`, a dot in the domain, no
 * spaces). Validating addresses properly is a losing game, and the cost of
 * being wrong here is a `mailto:` that bounces -- which is the tenant's own
 * typo in their own settings, visible to them on their own site.
 */
export function securityContactUri(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https:\/\/\S+$/.test(value)) return value;
  if (/^mailto:\S+@\S+\.\S+$/.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return null;
}

/**
 * When this file stops being valid: midnight UTC, one year on.
 *
 * RFC 9116 requires the field and says the value should not be more than a year
 * ahead. Anchoring to today's midnight rather than to the moment of the request
 * keeps it strictly under a year from any fetch, and keeps the rendered file
 * byte-identical for a whole day, which is what makes it cacheable.
 */
export function securityTxtExpires(now: Date): string {
  const expires = new Date(
    Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()),
  );
  return expires.toISOString();
}

/**
 * Wraps prose into comment lines.
 *
 * Every line is prefixed with `# `, which is also why a tenant's note cannot
 * turn into a field: a line the author started with `Contact:` is a comment
 * like any other. Newlines inside a paragraph are treated as breaks rather than
 * passed through, so a pasted-in note cannot smuggle a bare line into the file.
 */
function commentLines(text: string): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("#");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (line && `${line} ${word}`.length + 2 > COMMENT_WIDTH) {
        lines.push(`# ${line}`);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(`# ${line}`);
  }
  return lines;
}

/**
 * What every tenant's file says, because it is true of every tenant's file.
 *
 * The organization's own prose -- who answers, how fast, whether there is a
 * bounty -- is theirs to write and is rendered above this. This paragraph is
 * the platform speaking about the platform: the portal really does hold
 * personal data behind row-level security, and the request not to go rummaging
 * in it while proving a point is the one thing worth asking of every reporter.
 */
const PLATFORM_NOTE = [
  "This site runs on a shared operations platform. Its portal holds personal data behind Postgres row-level security policies, so a mistake there is a real one and we would much rather hear about it from you.",
  "Please do not access, modify, or retain anyone else's personal data while demonstrating an issue -- tell us what you found and we will reproduce it.",
];

export function buildSecurityTxt({
  organization,
  contact,
  note,
  origin,
  policyUrl,
  now,
}: SecurityTxtInput): string {
  const subject = organization ?? "This site";
  const lines: string[] = [
    ...commentLines(
      `${subject} -- how to report a security problem with this site.`,
    ),
  ];
  for (const paragraph of [...note, ...PLATFORM_NOTE]) {
    if (!paragraph.trim()) continue;
    lines.push("#", ...commentLines(paragraph));
  }

  lines.push(
    "",
    `Contact: ${contact}`,
    `Expires: ${securityTxtExpires(now)}`,
    "Preferred-Languages: en",
    `Canonical: ${origin}/.well-known/security.txt`,
  );
  if (policyUrl) lines.push(`Policy: ${policyUrl}`);

  return `${lines.join("\n")}\n`;
}
