"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { updateSiteImageAction, type SettingActionResult } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/inventory";
import type { SiteImageSlot } from "@/lib/site-images";

// next/image throws at render time (crashing the page) if `src` isn't a valid
// absolute URL or a root-relative path. resolveImageUrl passes non-Drive
// input through unchanged, so a partially-typed or malformed URL must be
// filtered out here before it ever reaches <Image>.
function isRenderableImageSrc(value: string | null): value is string {
  if (!value) return false;
  if (value.startsWith("/")) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function SiteImageGridItem({
  slot,
  imageUrl,
  selected,
  onSelect,
}: {
  slot: SiteImageSlot;
  imageUrl: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border text-left transition-colors",
        selected
          ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "border-border hover:border-muted-foreground/50",
      )}
    >
      <div className="relative aspect-square w-full bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 12vw, (min-width: 640px) 20vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="size-6 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <span className="line-clamp-2 px-2 py-1.5 text-xs font-medium">
        {slot.label}
      </span>
    </button>
  );
}

function SiteImageEditForm({
  slot,
  initialUrl,
}: {
  slot: SiteImageSlot;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const resolvedUrl = resolveImageUrl(url.trim() || null);
  const previewUrl = isRenderableImageSrc(resolvedUrl) ? resolvedUrl : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result: SettingActionResult = await updateSiteImageAction(
        slot.key,
        formData,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {previewUrl && (
        <div className="relative aspect-square w-24 overflow-hidden rounded-md bg-muted">
          <Image
            src={previewUrl}
            alt={slot.label}
            fill
            sizes="6rem"
            className="object-cover"
          />
        </div>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`site-image-${slot.key}`}>
            Google Drive URL
          </FieldLabel>
          <Input
            id={`site-image-${slot.key}`}
            name="url"
            type="url"
            placeholder="https://drive.google.com/file/d/..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <FieldDescription>{slot.description}</FieldDescription>
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>Image updated.</AlertDescription>
          </Alert>
        )}

        <div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function SiteImagesPanel({
  slots,
  urls,
}: {
  slots: SiteImageSlot[];
  urls: Record<string, string | null>;
}) {
  const [selectedSlot, setSelectedSlot] = useState(slots[0]?.key ?? "");
  const selected = slots.find((slot) => slot.key === selectedSlot) ?? slots[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
        {slots.map((slot) => {
          const resolvedUrl = resolveImageUrl(urls[slot.key] ?? null);
          return (
            <SiteImageGridItem
              key={slot.key}
              slot={slot}
              imageUrl={isRenderableImageSrc(resolvedUrl) ? resolvedUrl : null}
              selected={slot.key === selectedSlot}
              onSelect={() => setSelectedSlot(slot.key)}
            />
          );
        })}
      </div>

      <Card className="lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Edit image</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="site-image-slot-select">Slot</FieldLabel>
            <Select
              value={selectedSlot}
              onValueChange={(value) => value && setSelectedSlot(value)}
            >
              <SelectTrigger id="site-image-slot-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {slots.map((slot) => (
                  <SelectItem key={slot.key} value={slot.key}>
                    {slot.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {selected && (
            <SiteImageEditForm
              key={selected.key}
              slot={selected}
              initialUrl={urls[selected.key] ?? null}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
