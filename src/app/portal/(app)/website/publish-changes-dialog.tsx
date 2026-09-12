"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ContentSlot } from "@/lib/site-content";
import type { SlotChange } from "./content-diff";
import { ImagePreviewBox, useImagePreview } from "./image-preview";

/**
 * The slot behind this change if it is a photo, and null if it is copy.
 *
 * A photo needs different words from a sentence -- it has no "default
 * wording" to go back to, and clearing it shows the placeholder icon rather
 * than nothing at all (#918) -- and since #923 it needs a different control
 * as well, which needs the slot's `ratio`.
 */
function imageSlot(
  change: SlotChange,
): Extract<ContentSlot, { type: "image" }> | null {
  return change.slot.type === "image" ? change.slot : null;
}

/**
 * One side of a photo change: the picture, under a caption saying which side
 * of publishing it is.
 *
 * The URL is the fallback rather than the content. A link that cannot be
 * drawn -- a Drive *folder* link, a path that 404s -- has to say something,
 * and the only thing left to say about it is what it points at. `absent` is
 * the third case, and it is not the same as a broken link: this side of the
 * change has no photo at all.
 */
function PhotoSide({
  url,
  caption,
  absent,
  ratio,
  outgoing,
}: {
  url: string | null;
  caption: string;
  /** What to say when this side has no photo. */
  absent: string;
  /** The aspect the public site crops this slot to, as a CSS ratio. */
  ratio: string;
  /** Whether this is the picture coming off the site. */
  outgoing: boolean;
}) {
  const preview = useImagePreview(url);
  return (
    <div className={cn("min-w-0 space-y-1", outgoing && "app-muted")}>
      <p className="app-eyebrow">{caption}</p>
      {url === null ? (
        <p className="app-muted">{absent}</p>
      ) : preview.url ? (
        <ImagePreviewBox
          url={preview.url}
          ratio={ratio}
          onError={preview.markFailed}
          // Half the dialog rather than seven rems: here the picture is the
          // thing being judged, not a thumbnail beside the link box.
          className="h-auto w-full"
        />
      ) : (
        <p className={cn("break-all", outgoing && "line-through")}>{url}</p>
      )}
    </div>
  );
}

/**
 * A photo change as the two pictures, not as two URLs.
 *
 * The dialog was designed around copy (#793): it strikes through the sentence
 * being replaced and shows the sentence replacing it, which is right for
 * words and useless for a photo -- two near-identical sixty-character Drive
 * URLs, one struck through, answering nothing about whether this is the right
 * picture. And the picture that matters here is the *outgoing* one: whoever
 * is publishing has just seen the new one in the field above, while the old
 * one is the one they can no longer see anywhere (#923).
 *
 * Both sides are drawn at the slot's own aspect, so the comparison is the
 * crop the page will apply rather than two different crops of two pictures.
 */
function PhotoChange({ change, ratio }: { change: SlotChange; ratio: string }) {
  return (
    // Two columns where there is room and one where there is not, so the
    // pictures are read as before and after either way.
    <div className="mt-2 grid gap-4 sm:grid-cols-2">
      <PhotoSide
        url={change.before[0] ?? null}
        caption="Now on the site"
        absent="No photo is published here yet."
        ratio={ratio}
        outgoing
      />
      <PhotoSide
        url={change.after[0] ?? null}
        caption="After publishing"
        absent="The placeholder icon will be shown instead."
        ratio={ratio}
        outgoing={false}
      />
    </div>
  );
}

/**
 * What is about to go live, before it does (#793).
 *
 * Publishing used to be the same gesture as saving, so there was nothing to
 * confirm and nothing to show. Now that the two are separate, the moment that
 * matters is worth a list of exactly which words change -- shown the way the
 * audit log shows one, the copy being replaced struck through above the copy
 * replacing it.
 *
 * A photo is the exception, and goes through `PhotoChange` below: two
 * pictures rather than two URLs (#923). One page can hold both, so each
 * change takes the form its own slot calls for.
 */
export function PublishChangesDialog({
  open,
  onOpenChange,
  changes,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: readonly SlotChange[];
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {changes.length === 1
              ? "Publish this change?"
              : `Publish ${changes.length} changes?`}
          </DialogTitle>
          <DialogDescription>
            This replaces what the public website shows straight away.
          </DialogDescription>
        </DialogHeader>

        {changes.length === 0 ? (
          <Alert>
            <AlertDescription>
              Nothing here reads differently from what is already published.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {changes.map((change) => {
              const image = imageSlot(change);
              return (
                <div
                  key={change.slot.key}
                  className="rounded-lg border border-[var(--line)] p-3"
                >
                  <p className="font-medium">
                    {change.slot.label}
                    {change.toDefault && (
                      <span className="app-muted ml-2 text-xs font-normal">
                        {image
                          ? "back to no photo"
                          : "back to the default wording"}
                      </span>
                    )}
                  </p>
                  {image ? (
                    <PhotoChange change={change} ratio={image.ratio} />
                  ) : (
                    <>
                      {change.before.length > 0 && (
                        <ul className="app-muted mt-2 space-y-1 line-through">
                          {change.before.map((line, index) => (
                            <li key={index}>{line}</li>
                          ))}
                        </ul>
                      )}
                      {change.after.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {change.after.map((line, index) => (
                            <li key={index}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="app-muted mt-2">
                          Nothing will be shown here.
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter showCloseButton>
          <Button
            type="button"
            disabled={pending || changes.length === 0}
            onClick={onConfirm}
          >
            {pending ? (
              <>
                <Spinner /> Publishing...
              </>
            ) : (
              "Publish"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
