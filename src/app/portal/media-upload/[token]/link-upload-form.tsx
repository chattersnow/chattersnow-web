"use client";

import { useRef, useState } from "react";
import { MediaUploader } from "@/components/event-media/media-uploader";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  createVideoUpload,
  uploadEventPhotoOriginal,
} from "@/lib/storage/event-media";
import type { EventMediaQueueDeps } from "@/lib/storage/event-media-queue";
import {
  createLinkUploadSlotsAction,
  deleteLinkUploadAction,
  recordLinkUploadAction,
} from "./actions";

/**
 * The upload link page's form (#1620): who it is for, the organization's
 * rights paragraphs, the box that confirms them, then the uploader.
 *
 * The list under the uploader is only what this page has sent since it was
 * opened -- nothing already stored is shown -- and each file in it can be
 * deleted until the page is closed.
 */
export function LinkUploadForm({
  token,
  orgName,
  label,
  expiresAt,
  rightsParagraphs,
}: {
  token: string;
  orgName: string | null;
  label: string;
  /** Already formatted, with its zone. */
  expiresAt: string;
  rightsParagraphs: string[];
}) {
  const [confirmed, setConfirmed] = useState(false);
  // Read when each file is recorded, which is long after `deps` was built.
  const confirmedRef = useRef(false);
  const [deps] = useState<EventMediaQueueDeps>(() => ({
    keepOriginals: true,
    mintSlots: (files) => createLinkUploadSlotsAction(token, files),
    uploadPhoto: uploadEventPhotoOriginal,
    createVideoUpload,
    record: (slot, name) =>
      recordLinkUploadAction(token, slot.path, name, confirmedRef.current),
    remove: (ref) => deleteLinkUploadAction(token, ref),
  }));
  const org = orgName ?? "the organization";

  function handleConfirm(checked: boolean) {
    confirmedRef.current = checked;
    setConfirmed(checked);
  }

  return (
    <div className="flex flex-col gap-6">
      <p>
        Uploading as <strong>{label}</strong>. What you upload here goes
        straight to this event&apos;s photos and videos. This link works until{" "}
        {expiresAt}.
      </p>

      {rightsParagraphs.length > 0 && (
        <section
          aria-labelledby="media-upload-rights"
          className="flex flex-col gap-2"
        >
          <h2 id="media-upload-rights" className="font-semibold">
            How {org} uses what you upload
          </h2>
          {rightsParagraphs.map((paragraph, index) => (
            <p key={index} className="text-sm">
              {paragraph}
            </p>
          ))}
        </section>
      )}

      <Field orientation="horizontal">
        <Checkbox
          id="media-upload-consent"
          required
          checked={confirmed}
          onCheckedChange={(checked) => handleConfirm(checked === true)}
        />
        <FieldLabel htmlFor="media-upload-consent" required>
          These photos and videos are mine to share
          {rightsParagraphs.length > 0
            ? ", and I agree to the terms above."
            : `, and ${org} may keep them with this event.`}
        </FieldLabel>
      </Field>

      <MediaUploader
        deps={deps}
        disabled={!confirmed}
        hint="Photos are kept at full resolution. Videos up to 10 GB; keep this page open until they finish. You can delete a file here until you close the page."
      />
    </div>
  );
}
