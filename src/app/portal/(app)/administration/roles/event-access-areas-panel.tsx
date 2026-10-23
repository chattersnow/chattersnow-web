"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import type { EventAccessAreaOption } from "../../events/event-access-shared";
import { setEventAccessOfferedAreasAction } from "./event-access-actions";

/**
 * Which areas of an event this organization's per-event grants may cover
 * (#1689). Goods and money are sensitive and off until offered here; each
 * grant then still opts in to them. Turning an area off takes it out of every
 * grant's effective access at once without deleting a grant.
 */
export function EventAccessAreasPanel({
  areas,
}: {
  areas: EventAccessAreaOption[];
}) {
  const id = useId();
  const router = useRouter();
  const [offered, setOffered] = useState<string[]>(() =>
    areas.filter((area) => area.offered).map((area) => area.key),
  );
  const [isPending, startTransition] = useTransition();
  const saved = areas.filter((area) => area.offered).map((area) => area.key);
  const dirty =
    saved.length !== offered.length ||
    saved.some((key) => !offered.includes(key));

  function toggle(key: string, on: boolean) {
    setOffered((current) =>
      on ? [...current, key] : current.filter((value) => value !== key),
    );
  }

  function save() {
    startTransition(async () => {
      await runAction(() => setEventAccessOfferedAreasAction(offered), {
        success: "Offered areas saved.",
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Offered areas</CardTitle>
        <CardDescription>
          What a person given access to one event can be allowed to reach. Each
          grant picks from these. Turning one off takes it out of every existing
          grant at once, and turning it back on restores it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-3">
          {areas.map((area) => (
            <Field key={area.key} orientation="horizontal">
              <Checkbox
                id={`${id}-${area.key}`}
                checked={offered.includes(area.key)}
                onCheckedChange={(checked) =>
                  toggle(area.key, checked === true)
                }
              />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-${area.key}`}>
                  {area.label}
                  {area.sensitive && <Badge variant="warning">Sensitive</Badge>}
                </FieldLabel>
                <FieldDescription>{area.description}</FieldDescription>
              </FieldContent>
            </Field>
          ))}
        </FieldGroup>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={save} disabled={!dirty || isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save offered areas"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
