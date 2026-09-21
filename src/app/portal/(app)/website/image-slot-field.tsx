"use client";

import { useRef, useState } from "react";
import { ImageCropField } from "@/components/portal/image-crop-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { parseImageCrop, withTypedSrc } from "@/lib/image-crop";
import {
  deleteSitePhoto,
  sitePhotoPathFromUrl,
  uploadSitePhoto,
} from "@/lib/storage/site-photos";
import { createSitePhotoPathAction } from "./site-photo-actions";
import { OpenPictureLink, useImagePreview } from "./image-preview";

/**
 * The control for an `image` slot: a picture, a file to upload, and the link
 * box for one that is already somewhere on the web.
 *
 * Upload came second (#921). The slot was a link box alone, which meant
 * setting one photo was six steps outside the app -- open Drive, find the
 * file, Share, change access to "Anyone with the link", Copy link, come back,
 * paste -- across forty-six slots, and three of those steps go wrong in ways
 * the app cannot see: a folder link is a valid URL that serves HTML, and an
 * unshared file resolves to a thumbnail that 403s for every visitor while
 * looking right to the person who pasted it.
 *
 * The link box stays, and is not the lesser half. A photo already on the web,
 * or already in Drive, should not have to be re-uploaded to be used, and every
 * Drive link stored today keeps working exactly as it did -- this adds a way
 * in, it migrates nothing.
 *
 * A blank box is `null`, the slot's default, so "Back to default", the dirty
 * check and the draft that reverts the slot all agree on what empty means.
 *
 * Nothing is drawn while the slot is empty -- there is no crop to judge, and a
 * hole under each of eight unset slots is how Get Involved got long the first
 * time (#792). The section says once what blank does.
 *
 * Once there is a photo the picture is the control, not a thumbnail beside one
 * (#1251): the crop is set by dragging it inside the frame the public site
 * will crop it to. The crop rides on the value as a `#crop=` fragment, so it
 * is an ordinary slot edit as far as the dirty check, the draft and publishing
 * are concerned -- and the link box shows the value without it, because a rect
 * no one can picture has no business being in a box people type in.
 */
export function ImageSlotField({
  id,
  describedBy,
  label,
  ratio,
  value,
  onChange,
}: {
  id: string;
  /** The slot's status badge, which describes the control rather than naming it (#924). */
  describedBy?: string;
  label: string;
  /** The aspect the public site crops this slot to, as a CSS ratio. */
  ratio: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const preview = useImagePreview(value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Object paths uploaded during *this* editing session, and the only ones
   * ever deleted when the slot's photo is replaced.
   *
   * A URL that arrived as the slot's stored value is never touched, even when
   * it points into this bucket: `site_content` holds a draft value and a
   * published one, so the photo being replaced on screen may still be the one
   * the live site is serving. A stale object costs a few hundred kilobytes; a
   * deleted live one takes the picture off the website.
   */
  const uploadedPaths = useRef<Set<string>>(new Set());

  function discard(url: string | null) {
    const path = sitePhotoPathFromUrl(parseImageCrop(url).src);
    if (path && uploadedPaths.current.has(path)) {
      uploadedPaths.current.delete(path);
      void deleteSitePhoto(path);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear the input straight away so picking the same file twice in a row
    // still fires a change event.
    event.target.value = "";
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      // Path first, so somebody without `site_content:manage` is told
      // immediately rather than after the browser has spent several seconds
      // re-encoding a 12 MP photo.
      const pathResult = await createSitePhotoPathAction();
      if ("error" in pathResult) {
        setError(pathResult.error);
        return;
      }

      const result = await uploadSitePhoto(file, pathResult.path);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      uploadedPaths.current.add(result.path);
      const previous = value;
      // Through `withTypedSrc` rather than set directly, so the one rule about
      // what happens to a crop when the photo changes lives in one place: a
      // different picture needs a different crop and gets none.
      onChange(withTypedSrc(previous, result.url) || null);
      discard(previous);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {preview.url && (
        <ImageCropField
          url={value}
          ratio={ratio}
          label={label}
          onError={preview.markFailed}
          onChange={onChange}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/*
          A visible native file input rather than a Button over a hidden one:
          one tab stop, a real <label> (the slot's own, which points here), a
          native focus ring, and nothing for axe's aria-hidden-focus rule to
          catch. Same control as gear intake uses (#781).
        */}
        <input
          id={id}
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={handleFile}
          aria-describedby={describedBy}
          className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        {uploading && <Spinner aria-label="Uploading photo" />}
      </div>

      <FieldLabel htmlFor={`${id}-url`} className="font-normal">
        Or paste a link
      </FieldLabel>
      <Input
        id={`${id}-url`}
        type="url"
        placeholder="https://drive.google.com/file/d/..."
        disabled={uploading}
        // The stored link without its crop: `preview.src` is the *resolved*
        // one, and a Drive share link must come back out of this box as the
        // share link that was pasted into it.
        value={parseImageCrop(value).src ?? ""}
        onChange={(event) => {
          setError(null);
          onChange(withTypedSrc(value, event.target.value.trim()) || null);
        }}
      />
      {preview.failed && (
        <FieldDescription className="text-destructive">
          That link did not load as a picture. A Google Drive link has to be a
          file rather than a folder, and shared with anyone who has the link.
          Uploading the photo avoids both.
        </FieldDescription>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {preview.url && <OpenPictureLink url={preview.url} label={label} />}
    </>
  );
}

/**
 * The hint every image slot shares, said once per section rather than per slot
 * -- eighty-six fields each carrying their own paragraph is most of what made
 * this page three thousand pixels tall (#918).
 */
export function ImageSlotHint() {
  return (
    <FieldDescription>
      Photos can be uploaded, or given as a Google Drive share link or a direct
      image URL; blank shows the placeholder icon. An uploaded photo is resized
      for the web automatically, so there is no size to keep under. Drag a photo
      inside its frame, or use the sliders under it, to choose which part of it
      the page shows.
    </FieldDescription>
  );
}
