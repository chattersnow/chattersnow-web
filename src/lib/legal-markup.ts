/**
 * The small amount of markup a published legal document may carry.
 *
 * `LegalDocumentContent` holds prose as plain strings, which was enough while
 * the platform's own documents were React components carrying their own links
 * and lists. Since #858 both kinds of document are data -- the platform's
 * neutral default and whatever a tenant publishes -- and the real documents
 * need bullets and links: a privacy policy that cannot link the address you
 * write to for a deletion is worse than one that can.
 *
 * The answer is deliberately not a markdown library or a rich text editor.
 * Either one means storing HTML or an editor's own document model, and HTML on
 * a public page means a sanitizer. What these documents actually use is three
 * things, so this parses three things and treats everything else as literal
 * text:
 *
 *   - a paragraph whose every line starts with `- ` is a bullet list,
 *   - `[text](href)` is a link,
 *   - `**text**` is bold.
 *
 * There is nothing to sanitize because nothing here produces HTML: the caller
 * gets tokens and renders React elements from them, and a link whose href is
 * not `mailto:`, `https://` or site-relative is emitted as the literal text the
 * author typed rather than as a link.
 */

export type InlineRun =
  | { kind: "text"; text: string }
  | { kind: "strong"; runs: InlineRun[] }
  | { kind: "link"; href: string; runs: InlineRun[] };

export type LegalBlock =
  | { kind: "paragraph"; runs: InlineRun[] }
  | { kind: "bullets"; items: InlineRun[][] };

/**
 * `[text](href)` or `**text**`, whichever comes first.
 *
 * Built per call rather than shared: what a marker wraps is parsed again, and
 * a `g` regex carries `lastIndex` between calls.
 */
const INLINE = String.raw`\[([^\]\n]+)\]\(([^()\s]+)\)|\*\*([^*\n]+)\*\*`;

const BULLET = "- ";

/**
 * Whether a link may be published.
 *
 * `mailto:` and `https://` are what the documents use, a leading `/` is a page
 * on this site, and a leading `#` is a section of the document itself -- these
 * are long enough that "described under other agreements" wants to be a link.
 * `//host` is excluded on purpose: it is protocol-relative and leaves the site,
 * which is not what someone writing `/gears` meant. Every other scheme,
 * `javascript:` included, fails here and the link is rendered as the text the
 * author typed.
 */
export function isPublishableHref(href: string): boolean {
  if (href.startsWith("mailto:")) return href.length > "mailto:".length;
  if (href.startsWith("https://")) return href.length > "https://".length;
  if (href.startsWith("#")) return href.length > 1;
  return href.startsWith("/") && !href.startsWith("//");
}

/**
 * Splits one line of prose into its text, bold and link runs.
 *
 * What a marker wraps is parsed again, so a bold term that is also a link --
 * `**[Contact form](/contact)**`, which is how a definition list reads once it
 * is bullets -- comes out as both rather than as the outer marker swallowing
 * the inner one. The recursion is bounded: each step strips a pair of markers.
 */
export function parseInline(line: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const pattern = new RegExp(INLINE, "g");
  let last = 0;

  const push = (text: string) => {
    if (!text) return;
    const previous = runs[runs.length - 1];
    // Keep adjacent literal text in one run, so a rejected link does not split
    // a sentence into three nodes.
    if (previous?.kind === "text") previous.text += text;
    else runs.push({ kind: "text", text });
  };

  for (
    let match = pattern.exec(line);
    match !== null;
    match = pattern.exec(line)
  ) {
    push(line.slice(last, match.index));
    last = match.index + match[0].length;

    const [source, linkText, href, strongText] = match;
    if (strongText !== undefined) {
      runs.push({ kind: "strong", runs: parseInline(strongText) });
    } else if (isPublishableHref(href)) {
      runs.push({ kind: "link", href, runs: parseInline(linkText) });
    } else {
      push(source);
    }
  }
  push(line.slice(last));

  return runs;
}

/**
 * A document's prose as plain text, markers and all markup removed.
 *
 * For anything reading the words rather than rendering them -- the editor's
 * search rail, the publish diff, the tests that check what a document does and
 * does not say.
 */
export function legalPlainText(paragraphs: readonly string[]): string {
  const runsText = (runs: readonly InlineRun[]): string =>
    runs
      .map((run) => (run.kind === "text" ? run.text : runsText(run.runs)))
      .join("");

  return parseLegalBlocks(paragraphs)
    .map((block) =>
      block.kind === "bullets"
        ? block.items.map(runsText).join("\n")
        : runsText(block.runs),
    )
    .join("\n");
}

/**
 * Turns a document's `paragraphs` into the blocks a page renders.
 *
 * A paragraph is a bullet list only when every one of its lines is a bullet.
 * A mixed block is prose that happens to contain a dash, and rendering half of
 * it as a list would be a surprise; it stays one paragraph.
 */
export function parseLegalBlocks(paragraphs: readonly string[]): LegalBlock[] {
  return paragraphs.map((paragraph) => {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > 0 && lines.every((line) => line.startsWith(BULLET))) {
      return {
        kind: "bullets",
        items: lines.map((line) => parseInline(line.slice(BULLET.length))),
      };
    }
    return { kind: "paragraph", runs: parseInline(paragraph) };
  });
}
