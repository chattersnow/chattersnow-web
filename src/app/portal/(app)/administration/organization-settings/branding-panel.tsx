"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import {
  BRAND_COLOR_TOKENS,
  DEFAULT_ACCENT_STOPS,
  MAX_ACCENT_STOPS,
  type Branding,
} from "@/lib/branding";
import { resolveImageUrl } from "@/lib/inventory";
import { updateBrandingAction, type SettingActionResult } from "./actions";

/**
 * Per-tenant branding (#707 Phase 4): the colour tokens, the accent
 * gradient and the logo. Everything is optional; a blank field means "the
 * platform default", and Reset puts every field back to it.
 */
export function BrandingPanel({ branding }: { branding: Branding }) {
  const router = useRouter();
  const [colors, setColors] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      BRAND_COLOR_TOKENS.map((token) => [
        token.key,
        branding.colors[token.key] ?? "",
      ]),
    ),
  );
  const [accentStops, setAccentStops] = useState(
    branding.accentStops?.join(", ") ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewStops = accentStops
    .split(",")
    .map((stop) => stop.trim())
    .filter(Boolean);
  const previewGradient = `linear-gradient(90deg, ${(previewStops.length > 1
    ? previewStops
    : previewStops.length === 1
      ? [previewStops[0], previewStops[0]]
      : DEFAULT_ACCENT_STOPS
  ).join(", ")})`;
  const logoPreview = resolveImageUrl(logoUrl.trim() || null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateBrandingAction(formData),
        {
          success: "Branding updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  function handleReset() {
    setColors(Object.fromEntries(BRAND_COLOR_TOKENS.map((t) => [t.key, ""])));
    setAccentStops("");
    setLogoUrl("");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Colours</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {BRAND_COLOR_TOKENS.map((token) => (
              <Field key={token.key}>
                <FieldLabel htmlFor={`brand-${token.key}`}>
                  {token.label}
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`${token.label} picker`}
                    value={colors[token.key] || token.defaultValue}
                    onChange={(event) =>
                      setColors({ ...colors, [token.key]: event.target.value })
                    }
                    className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                  <Input
                    id={`brand-${token.key}`}
                    name={token.key}
                    placeholder={token.defaultValue}
                    value={colors[token.key]}
                    onChange={(event) =>
                      setColors({ ...colors, [token.key]: event.target.value })
                    }
                    pattern="#[0-9a-fA-F]{6}"
                    className="font-mono"
                  />
                </div>
                <FieldDescription>{token.description}</FieldDescription>
              </Field>
            ))}
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Accent bar</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="brand-accent-stops">
                  Gradient colours
                </FieldLabel>
                <div
                  aria-hidden
                  className="h-2 w-full rounded-full"
                  style={{ background: previewGradient }}
                />
                <Input
                  id="brand-accent-stops"
                  name="accent_stops"
                  placeholder={DEFAULT_ACCENT_STOPS.join(", ")}
                  value={accentStops}
                  onChange={(event) => setAccentStops(event.target.value)}
                  className="font-mono"
                />
                <FieldDescription>
                  Up to {MAX_ACCENT_STOPS} hex colours, comma-separated, left to
                  right. One colour makes a solid bar.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {logoPreview && (
                <div className="relative size-20 overflow-hidden rounded-md bg-muted">
                  <Image
                    src={logoPreview}
                    alt="Logo preview"
                    fill
                    sizes="5rem"
                    className="object-contain"
                  />
                </div>
              )}
              <Field>
                <FieldLabel htmlFor="brand-logo-url">Logo URL</FieldLabel>
                <Input
                  id="brand-logo-url"
                  name="logo_url"
                  type="url"
                  placeholder="https://drive.google.com/file/d/..."
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                />
                <FieldDescription>
                  A Google Drive link or any image URL. Shown in the site header
                  and footer and in the portal sidebar.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save branding"
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={handleReset}
          >
            Reset to defaults
          </Button>
        </div>
      </div>
    </form>
  );
}
