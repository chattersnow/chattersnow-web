import { paginateLabels, type LabelLayout } from "@/lib/inventory-labels";

export type PrintableLabel = {
  itemId: string;
  code: string;
  description: string;
  size: string | null;
  qrSrc: string;
  barcodeSrc: string | null;
};

/**
 * The sheets themselves, at their printed size in inches. On screen each one
 * is drawn as a sheet of paper with the label edges dashed in, so what is
 * checked before printing is exactly what the printer gets; on paper only the
 * labels' contents are left.
 *
 * Black on white in both themes: this is a picture of paper, and a label that
 * previews in dark mode would not be the label that prints.
 */
export function LabelSheets({
  labels,
  layout,
  skip,
}: {
  labels: PrintableLabel[];
  layout: LabelLayout;
  skip: number;
}) {
  const pages = paginateLabels(labels, layout, skip);
  const inches = (value: number) => `${value}in`;

  return (
    <>
      <style>{printCss(layout)}</style>
      <div className="label-print print-area flex flex-col items-start gap-6 print:block">
        {pages.map((cells, pageIndex) => (
          <section
            key={pageIndex}
            aria-label={
              pages.length > 1
                ? `Sheet ${pageIndex + 1} of ${pages.length}`
                : "Sheet"
            }
            className="box-border grid shrink-0 overflow-hidden bg-white text-black shadow-md ring-1 ring-black/10 print:shadow-none print:ring-0 print:[&:not(:last-child)]:break-after-page"
            style={{
              width: inches(layout.page.width),
              height: inches(layout.page.height),
              paddingTop: inches(layout.marginTop),
              paddingLeft: inches(layout.marginLeft),
              gridTemplateColumns: `repeat(${layout.columns}, ${inches(layout.label.width)})`,
              gridAutoRows: inches(layout.label.height),
              columnGap: inches(layout.gapX),
              rowGap: inches(layout.gapY),
            }}
          >
            {cells.map((label, cellIndex) =>
              label ? (
                <LabelCell key={cellIndex} label={label} layout={layout} />
              ) : (
                <div
                  key={cellIndex}
                  aria-hidden
                  className="rounded-sm border border-dashed border-black/15 print:border-0"
                />
              ),
            )}
          </section>
        ))}
      </div>
    </>
  );
}

/**
 * The print rules for this page only; the element unmounts with the page, so
 * nothing here outlives it.
 *
 * The shared `.print-area` rule in globals.css hides the rest of the page and
 * pins the printed element to its nearest positioned ancestor. That is right
 * for a receipt, which only has to be on the paper, but a label sheet has to
 * sit to the sixteenth of an inch, and inside the portal that ancestor is the
 * content column, beside the (invisible) sidebar. Hidden content also keeps
 * its height, which on a 1¼-inch label-printer page is a run of blank labels.
 * So here everything that is neither the sheets nor one of their ancestors is
 * taken out of the layout, the ancestors are flattened to plain blocks, and
 * the sheets print from the page's corner. `.print-area` stays on the element
 * so the shared visibility rule still applies to it.
 *
 * `@page` replaces the portal's 12mm margin: the sheet's own geometry places
 * every label, and a printer margin on top of it would push the last row off
 * the paper.
 */
function printCss(layout: LabelLayout): string {
  return `
@page { size: ${layout.page.width}in ${layout.page.height}in; margin: 0; }
@media print {
  body *:not(:has(.label-print), .label-print, .label-print *) {
    display: none !important;
  }
  html, body, *:has(.label-print) {
    display: block !important;
    position: static !important;
    inset: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    width: auto !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    transform: none !important;
    box-shadow: none !important;
    background: none !important;
  }
  .label-print.print-area {
    position: static !important;
    inset: auto !important;
  }
}`;
}

function LabelCell({
  label,
  layout,
}: {
  label: PrintableLabel;
  layout: LabelLayout;
}) {
  // A tenth of an inch of padding keeps the print inside what a label's die
  // cut tolerates; the QR takes the full remaining height, and its own quiet
  // zone is the space between it and the text.
  const padding = 0.1;
  const qrSize = layout.label.height - padding * 2;
  const large = layout.label.height >= 2;

  return (
    <div
      className="flex items-center overflow-hidden rounded-sm border border-dashed border-black/25 print:border-0"
      style={{ padding: `${padding}in`, paddingLeft: "0.04in" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI
          drawn on the server; there is nothing for next/image to optimize. */}
      <img
        src={label.qrSrc}
        alt=""
        className="shrink-0 [image-rendering:pixelated]"
        style={{ width: `${qrSize}in`, height: `${qrSize}in` }}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch leading-tight">
        <p
          className={
            large
              ? "line-clamp-3 text-[11pt] font-medium break-words"
              : "line-clamp-2 text-[7pt] font-medium break-words"
          }
        >
          {label.description}
        </p>
        {label.size && (
          <p className={large ? "text-[9pt]" : "text-[6pt]"}>
            Size {label.size}
          </p>
        )}
        <p
          className={
            large
              ? "font-mono text-[16pt] font-bold tracking-[0.12em]"
              : "font-mono text-[10pt] font-bold tracking-[0.08em]"
          }
        >
          {label.code}
        </p>
        {label.barcodeSrc && (
          /* eslint-disable-next-line @next/next/no-img-element -- as above */
          <img
            src={label.barcodeSrc}
            alt=""
            className="w-full min-h-0 object-contain object-left"
            style={{ height: large ? "0.45in" : "0.2in" }}
          />
        )}
      </div>
    </div>
  );
}
