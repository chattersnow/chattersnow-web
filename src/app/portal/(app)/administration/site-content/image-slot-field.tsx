"use client";

import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ImagePreviewBox,
  OpenPictureLink,
  useImagePreview,
} from "./image-preview";

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
 */
export function ImageSlotField({
  id,
  label,
  ratio,
  value,
  onChange,
}: {
  id: string;
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
        <ImagePreviewBox
          url={preview.url}
          ratio={ratio}
          onError={preview.markFailed}
        />
      )}
      <Input
        id={id}
        type="url"
        placeholder="https://drive.google.com/file/d/..."
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value.trim() || null)}
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
      the placeholder icon.
    </FieldDescription>
  );
}
