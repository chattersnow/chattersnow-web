"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  MAX_LABEL_ITEMS,
  numberedCodesHref,
  parseNumberRange,
} from "@/lib/inventory-labels";
import { generateNumberedCodesAction, setTagPrefixAction } from "./actions";

/**
 * The tenant's three-letter prefix, set once before the first code. Editable
 * until then; the page stops offering it after, since the database refuses.
 */
export function PrefixForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [prefix, setPrefix] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setTagPrefixAction(prefix);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`Prefix set to ${result.prefix}.`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="tag-prefix">Prefix</FieldLabel>
          <Input
            id="tag-prefix"
            required
            maxLength={3}
            autoCapitalize="characters"
            autoComplete="off"
            pattern="[A-Za-z]{3}"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value.toUpperCase())}
            className="w-24 font-mono tracking-wider"
          />
          <FieldDescription>
            Three letters that start every code, like ABC in ABC-007. It
            can&rsquo;t change once codes exist, because printed labels and NFC
            tags carry it.
          </FieldDescription>
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="self-start" disabled={isPending}>
          {isPending && <Spinner />} Save prefix
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Makes the next N codes and opens them to print. */
export function GenerateCodesForm() {
  const router = useRouter();
  const [count, setCount] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await generateNumberedCodesAction(Number(count));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(numberedCodesHref(result.range));
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="numbered-code-count">Number of codes</FieldLabel>
          <Input
            id="numbered-code-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_LABEL_ITEMS}
            required
            value={count}
            onChange={(event) => setCount(event.target.value)}
            className="w-32"
          />
          <FieldDescription>
            The next numbers after the last code, all free. They open on a sheet
            to print.
          </FieldDescription>
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="self-start" disabled={isPending}>
          {isPending && <Spinner />} Create codes
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Prints a range of existing codes, e.g. to replace a torn sheet. */
export function PrintRangeForm({ last }: { last: number }) {
  const router = useRouter();
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState(String(Math.min(last, MAX_LABEL_ITEMS)));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const range = parseNumberRange(`${from}-${to}`);
    if (!range) {
      setError("Enter the first and last number to print.");
      return;
    }
    setError(null);
    router.push(numberedCodesHref(range));
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field orientation="horizontal" className="flex-wrap items-end">
          <Field className="w-auto">
            <FieldLabel htmlFor="print-from">From</FieldLabel>
            <Input
              id="print-from"
              type="number"
              inputMode="numeric"
              min={1}
              max={last}
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-28"
            />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="print-to">To</FieldLabel>
            <Input
              id="print-to"
              type="number"
              inputMode="numeric"
              min={1}
              max={last}
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-28"
            />
          </Field>
          <Button type="submit" variant="secondary">
            <Printer /> Print
          </Button>
        </Field>
        <FieldDescription>
          Up to {MAX_LABEL_ITEMS} labels at a time.
        </FieldDescription>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
}
