"use client";

import { useMemo } from "react";
import Lightbox from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Download from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";

export type LightboxPhoto = {
  url: string;
  downloadUrl: string | null;
  filename: string;
};

/**
 * An event's photos full screen (#1607): next and previous by swipe or the
 * arrow keys, zoom, and a download of the photo on screen through its signed
 * URL. Its own module so the tab loads it only when a photo is opened, as the
 * publication reader does (#1473).
 */
export default function MediaLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const slides = useMemo(
    () =>
      photos.map((photo) => ({
        src: photo.url,
        alt: photo.filename,
        download: photo.downloadUrl
          ? { url: photo.downloadUrl, filename: photo.filename }
          : false,
      })),
    [photos],
  );

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Zoom, Counter, Download]}
      on={{ view: ({ index: viewed }) => onIndexChange(viewed) }}
      carousel={{ finite: true }}
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      controller={{ closeOnBackdropClick: true }}
      labels={{
        Lightbox: "Event photos",
        "Photo gallery": "Event photos",
        Slide: "photo",
        "{index} of {total}": "Photo {index} of {total}",
        Previous: "Previous photo",
        Next: "Next photo",
        Download: "Download photo",
      }}
    />
  );
}
