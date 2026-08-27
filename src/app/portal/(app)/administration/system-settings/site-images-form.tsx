"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
import { resolveImageUrl } from "@/lib/inventory";
import type { SiteImageSlot } from "@/lib/site-images";

function SiteImageCard({
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

  const previewUrl = resolveImageUrl(url.trim() || null);

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
    <Card>
      <CardHeader>
        <CardTitle>{slot.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 sm:flex-row"
        >
          {previewUrl && (
            <div className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-md bg-muted">
              <Image
                src={previewUrl}
                alt={slot.label}
                fill
                sizes="5rem"
                className="object-cover"
              />
            </div>
          )}
          <FieldGroup className="flex-1">
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
      </CardContent>
    </Card>
  );
}

export function SiteImagesForm({
  slots,
  urls,
}: {
  slots: SiteImageSlot[];
  urls: Record<string, string | null>;
}) {
  return (
    <div className="space-y-6">
      {slots.map((slot) => (
        <SiteImageCard
          key={slot.key}
          slot={slot}
          initialUrl={urls[slot.key] ?? null}
        />
      ))}
    </div>
  );
}
