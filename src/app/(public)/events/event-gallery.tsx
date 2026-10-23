"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  hasPublicEventMedia,
  publicEventPhotoAlt,
  type PublicEventMedia,
} from "@/lib/public-event-gallery";

const MediaLightbox = dynamic(
  () => import("@/components/event-media/media-lightbox"),
  { ssr: false },
);

/**
 * An event's public photos and videos (#1654): a thumbnail grid that opens
 * the lightbox, then the videos, played straight from the file as the portal
 * plays them (#1605). Renders nothing when there is nothing public.
 *
 * On the event page it previews the newest photos and ends with a link to the
 * whole gallery (`allPhotosHref`); the gallery page passes none, and shows one
 * page of photos with its pager under the grid (#1683). The lightbox steps
 * through the page on screen.
 */
export function EventGallery({
  eventName,
  media,
  allPhotosHref,
  pager,
  headingId = "event-gallery",
}: {
  eventName: string;
  media: PublicEventMedia;
  allPhotosHref?: string;
  /** Rendered under the photo grid: the gallery page's pager. */
  pager?: ReactNode;
  headingId?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!hasPublicEventMedia(media)) return null;
  const { photos, videos, photoCount, photoOffset } = media;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-xl font-semibold">
        {photos.length > 0 ? "Photos" : "Videos"}
      </h2>

      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => {
            const alt = publicEventPhotoAlt(
              eventName,
              photoOffset + index,
              photoCount,
              photo.caption,
            );
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  className="block w-full overflow-hidden rounded-md border border-[var(--line)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => setOpenIndex(index)}
                  aria-label={`Open ${alt}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; next/image would cache it past its expiry */}
                  <img
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {photos.length > 0 && pager}

      {videos.length > 0 && (
        <div className="flex flex-col gap-3">
          {photos.length > 0 && (
            <h3 className="text-base font-semibold">Videos</h3>
          )}
          <ul className="grid gap-4 sm:grid-cols-2">
            {videos.map((video, index) => (
              <li key={video.id} className="flex flex-col gap-1">
                <video
                  src={video.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full rounded-md bg-black"
                  aria-label={
                    video.caption?.trim() ||
                    `Video ${index + 1} of ${videos.length} from ${eventName}`
                  }
                />
                {video.caption && (
                  <p className="app-muted text-sm">{video.caption}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {allPhotosHref && photoCount > 0 && (
        <p className="text-sm">
          <Link href={allPhotosHref} className="underline underline-offset-4">
            View all photos ({photoCount})
          </Link>
        </p>
      )}

      {openIndex !== null && photos[openIndex] && (
        <MediaLightbox
          photos={photos.map((photo, index) => ({
            url: photo.url,
            alt: publicEventPhotoAlt(
              eventName,
              photoOffset + index,
              photoCount,
              photo.caption,
            ),
            download: null,
          }))}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </section>
  );
}
