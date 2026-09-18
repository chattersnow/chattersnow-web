"use client";

import { ImageCropField } from "@/components/portal/image-crop-field";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseImageCrop, withTypedSrc } from "@/lib/image-crop";
import { OpenPictureLink, useImagePreview } from "./image-preview";

/**
 * The control for an `image` slot: a link box with the picture it points at.
 *
 * A link rather than an upload, as the System Settings panel it replaces was
 * (#812): the site's photos live in Google Drive, and `PhotoUploadField`
 * uploads into the gear-photos bucket behind the inventory permissions. A
 * blank box is `null`, the slot's default, so "Back to default", the dirty
 * check and the draft that reverts the slot all agree on what empty means.
 *
 * Nothing is drawn while the box is blank -- there is no crop to judge, and a
 * hole under each of eight unset slots is how Get Involved got long the first
 * time (#792). The section says once what blank does.
 *
 * Once there is a link the picture is the control, not a thumbnail beside one
 * (#1251): the crop is set by dragging it inside the frame the public site
 * will crop it to. The crop rides on the value as a `#crop=` fragment, so it
 * is an ordinary slot edit as far as the dirty check, the draft and publishing
 * are concerned -- and the link box below shows the value without it, because
 * a rect no one can picture has no business being in a box people type in.
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
  /** The slot's status badge, which describes the box rather than naming it (#924). */
  describedBy?: string;
  label: string;
  /** The aspect the public site crops this slot to, as a CSS ratio. */
  ratio: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const preview = useImagePreview(value);

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
      <Input
        id={id}
        aria-describedby={describedBy}
        type="url"
        placeholder="https://drive.google.com/file/d/..."
        // The stored link without its crop: `preview.src` is the *resolved*
        // one, and a Drive share link must come back out of this box as the
        // share link that was pasted into it.
        value={parseImageCrop(value).src ?? ""}
        onChange={(event) =>
          onChange(withTypedSrc(value, event.target.value.trim()) || null)
        }
      />
      {preview.failed && (
        <FieldDescription className="text-destructive">
          That link did not load as a picture. A Google Drive link has to be a
          file rather than a folder, and shared with anyone who has the link.
        </FieldDescription>
      )}
      {preview.url && <OpenPictureLink url={preview.url} label={label} />}
    </>
  );
}

/** The hint every image slot shares, said once per section rather than per slot. */
export function ImageSlotHint() {
  return (
    <FieldDescription>
      Photos take a Google Drive share link or a direct image URL; blank shows
      the placeholder icon. Drag a photo inside its frame, or use the sliders
      under it, to choose which part of it the page shows.
    </FieldDescription>
  );
}
