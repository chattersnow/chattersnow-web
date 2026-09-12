"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLayoutSettingAction } from "./settings-actions";
import type { SettingActionResult } from "@/lib/settings/write-app-setting";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
// Type-only: @/lib/site-layout also exports getSiteLayout, which pulls in
// createSupabaseServerClient and must not reach the client bundle. The slot
// list arrives as a prop from the server page, same as PageVisibilityPanel.
import { Switch } from "@/components/ui/switch";
import type { LayoutSlot, LayoutValue } from "@/lib/site-layout";
import { runAction } from "@/components/portal/action-toast";

function optionLabel(slot: LayoutSlot, value: LayoutValue): string {
  return (
    slot.options.find((option) => option.value === value)?.label ??
    String(value)
  );
}

/**
 * Selects speak strings, but a slot's values can be numbers or booleans, so
 * the option list is the lookup table in both directions. Serialising with
 * `String()` is safe because no slot mixes types -- 1 and "1" would collide.
 */
function valueFromString(slot: LayoutSlot, raw: string): LayoutValue {
  return (
    slot.options.find((option) => String(option.value) === raw)?.value ??
    slot.defaultValue
  );
}

function LayoutRow({
  slot,
  value,
  onError,
}: {
  slot: LayoutSlot;
  value: LayoutValue;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  // Same reasoning as PageVisibilityPanel: `useOptimistic` rather than plain
  // state, so the picker drops back to the server's own value when the
  // transition ends and can never keep showing a change the server refused.
  const [selected, setSelected] = useOptimistic(value);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: LayoutValue) {
    onError(null);

    startTransition(async () => {
      setSelected(next);
      await runAction<SettingActionResult>(
        () => updateLayoutSettingAction(slot.key, next),
        {
          success: `${slot.label} is now ${optionLabel(slot, next)}.`,
          onError,
          onSuccess: () => {
            // Keeps the transition open until the server tree is refetched, so
            // the optimistic value hands off directly to the re-read one.
            router.refresh();
          },
        },
      );
    });
  }

  const labelId = `layout-${slot.key}-label`;

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium">
          {slot.label}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          {slot.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {isPending ? <Spinner className="size-4" /> : null}
        {slot.control === "switch" ? (
          <>
            <span className="app-muted w-24 text-right text-xs">
              {optionLabel(slot, selected)}
            </span>
            <Switch
              checked={selected === slot.options[0].value}
              onCheckedChange={(on) =>
                handleChange((on ? slot.options[0] : slot.options[1]).value)
              }
              disabled={isPending}
              aria-labelledby={labelId}
            />
          </>
        ) : (
          <Select
            value={String(selected)}
            onValueChange={(next) =>
              handleChange(valueFromString(slot, String(next)))
            }
            disabled={isPending}
          >
            <SelectTrigger aria-labelledby={labelId} className="w-44 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {slot.options.map((option) => (
                <SelectItem
                  key={String(option.value)}
                  value={String(option.value)}
                >
                  {option.hint
                    ? `${option.label} — ${option.hint}`
                    : option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

export function LayoutPanel({
  slots,
  values,
}: {
  slots: LayoutSlot[];
  /** Resolved per slot, so one with no row still shows its default. */
  values: Record<string, LayoutValue>;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="divide-y divide-[var(--line)]">
          {slots.map((slot) => (
            <LayoutRow
              key={slot.key}
              slot={slot}
              value={values[slot.key] ?? slot.defaultValue}
              onError={setError}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
