"use client";

import { useEffect, useMemo } from "react";
import Lightbox from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import type { PublicationPage } from "@/lib/publications";

/**
 * An issue's pages full screen (#1473): swipe or the arrow keys between pages,
 * Home and End to the covers, pinch or the wheel to zoom, and thumbnails to
 * jump. Its own module so the reader loads it only when a page is opened.
 *
 * `index` is controlled: the reader opens it on the page that was tapped and
 * learns where the viewer ended up, so closing leaves them on that page.
 */
export default function PageLightbox({
  title,
  pages,
  index,
  onIndexChange,
  onClose,
}: {
  title: string;
  pages: PublicationPage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const slides = useMemo(
    () =>
      pages.map(({ image, altText }) => ({
        src: image.url,
        alt: altText,
        width: image.width,
        height: image.height,
        srcSet: image.sources?.map((source) => ({
          src: source.url,
          width: source.width,
          height: Math.round((source.width * image.height) / image.width),
        })),
      })),
    [pages],
  );

  // The lightbox handles the arrows and Escape itself; the covers are ours.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Home") {
        event.preventDefault();
        onIndexChange(0);
      } else if (event.key === "End") {
        event.preventDefault();
        onIndexChange(pages.length - 1);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onIndexChange, pages.length]);

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Zoom, Thumbnails, Counter]}
      on={{ view: ({ index: viewed }) => onIndexChange(viewed) }}
      carousel={{ finite: true }}
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      controller={{ closeOnBackdropClick: true }}
      labels={{
        Lightbox: title,
        "Photo gallery": `Pages of ${title}`,
        Slide: "page",
        "{index} of {total}": "Page {index} of {total}",
        Previous: "Previous page",
        Next: "Next page",
      }}
    />
  );
}
