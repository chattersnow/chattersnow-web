import "server-only";
import { code128, drawingSVG, qrcode } from "bwip-js/node";

/**
 * The two symbols an asset-tag label carries (#1420 part 2), drawn as SVG on
 * the server so the print page ships no barcode library to the browser. Both
 * come back as `data:` URIs for an `<img>`, which scales them to the label
 * without the markup of a few hundred `<path>` segments in the page.
 *
 * bwip-js rather than a QR-only package, because it draws both symbologies
 * from one dependency.
 */

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * The tag URL as a QR code, at error correction M (15%) -- BWIPP's default
 * for QR, which the typings do not let us spell out. M survives a scuffed or
 * partly peeled label while keeping a ~50-character URL at version 3, which
 * still reads at the 0.8 in a 1-inch label leaves for it.
 *
 * The four-module quiet zone the QR spec requires is drawn into the image
 * (`padding` counts in bwip-js's half-module units at the default scale), so
 * the white margin is part of the symbol and nothing on the label -- the
 * text beside it, the die cut -- can crowd it.
 */
export function qrCodeDataUri(text: string): string {
  return svgDataUri(qrcode({ bcid: "qrcode", text, padding: 8 }, drawingSVG()));
}

/**
 * The bare code as Code128, for 1D-only handheld scanners. It encodes the code
 * rather than the URL: a URL in Code128 is too wide to read on a label this
 * size, and the lookup accepts a bare code (`parseScannedTag`). Padded with
 * the ten-module quiet zone Code128 needs on each side.
 */
export function code128DataUri(text: string): string {
  return svgDataUri(
    code128(
      { bcid: "code128", text, height: 6, paddingwidth: 10 },
      drawingSVG(),
    ),
  );
}
