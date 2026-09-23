"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mountain } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
import { OTHER_MOUNTAIN } from "@/lib/rider-profile";
import {
  updateRiderMountainsAction,
  type RiderMountainsResult,
} from "./rider-mountains-actions";

/**
 * The preferred-mountain list the rider profile offers (#1408).
 *
 * A sheet on the Events page rather than a route of its own. It is one list
 * that shapes one question, rendered only for a tenant with the rider_profile
 * module -- and a nav entry for it would have turned Events into a section with
 * sub-items for every tenant, most of whom would then see a disclosure holding
 * a single link. Same shape as the Outstanding tasks sheet beside it.
 *
 * One name per line, in the order the pickers show them. Editing the list
 * never rewrites anybody's stored answer: a name that is removed stays on the
 * records that chose it, and the pickers show it as typed-in ("Other").
 */
export function RiderMountainsSheet({ mountains }: { mountains: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(mountains.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setText(mountains.join("\n"));
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const outcome = await runAction<RiderMountainsResult>(
        () => updateRiderMountainsAction(text),
        {
          success: "Mountain list saved.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
      if (outcome.ok) setOpen(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <Mountain className="size-4" />
        Mountains
      </SheetTrigger>
      <SheetContent side="right" size="md">
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
          aria-busy={isPending}
        >
          <SheetHeader>
            <SheetTitle>Mountains</SheetTitle>
            <SheetDescription>
              The mountains the rider profile offers after someone registers,
              and at the door.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="rider-mountains">
                  One mountain per line
                </FieldLabel>
                <Textarea
                  id="rider-mountains"
                  rows={14}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby="rider-mountains-help"
                />
                <FieldDescription id="rider-mountains-help">
                  In the order people should see them. &ldquo;{OTHER_MOUNTAIN}
                  &rdquo; is always offered last, with a box to type a name in,
                  so leave it out. Removing a mountain doesn&apos;t change
                  anyone&apos;s saved answer.
                </FieldDescription>
              </Field>
            </FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              Save mountains
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
