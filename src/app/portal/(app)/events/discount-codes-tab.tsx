"use client";

import { FormEvent, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  assignDiscountCodeAction,
  createDiscountCodesAction,
  deleteDiscountCodeAction,
  listDiscountCodesAction,
  type DiscountCode,
} from "./discount-codes-actions";
import {
  listEventRegistrantsAction,
  type EventRegistrant,
} from "./registrants-actions";
import { useTabData, useResetOnModeChange } from "@/hooks/use-tab-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// Base UI's Select doesn't accept an empty-string item value, so "no
// registrant assigned" needs its own sentinel instead.
const UNASSIGNED = "__unassigned__";

function AddCodesForm({
  eventId,
  onSaved,
  onCancel,
}: {
  eventId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [codes, setCodes] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("codes", codes);
    formData.set("description", description);
    formData.set("source", source);

    startTransition(async () => {
      const result = await createDiscountCodesAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="discount-codes-batch">
            Codes (one per line)
          </FieldLabel>
          <Textarea
            id="discount-codes-batch"
            placeholder={"SPRING10\nSPRING11\nSPRING12"}
            value={codes}
            onChange={(event) => setCodes(event.target.value)}
            rows={6}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="discount-codes-description">
              Discount description
            </FieldLabel>
            <Input
              id="discount-codes-description"
              placeholder="e.g. $10 off"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="discount-codes-source">Source</FieldLabel>
            <Input
              id="discount-codes-source"
              placeholder="e.g. ACME Vendor"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </Field>
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Add codes"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function DiscountCodesTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const {
    data: codes,
    loadError,
    refresh: refreshCodes,
  } = useTabData<DiscountCode[]>(
    () => listDiscountCodesAction(eventId),
    active,
    [eventId],
  );
  const { data: registrants, refresh: refreshRegistrants } = useTabData<
    EventRegistrant[]
  >(() => listEventRegistrantsAction(eventId), active, [eventId]);
  const [showAdd, setShowAdd] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useResetOnModeChange(mode, () => setShowAdd(false));

  function refreshAll() {
    refreshCodes();
    refreshRegistrants();
  }

  function handleAssign(codeId: string, registrationId: string) {
    setAssignError(null);
    startTransition(async () => {
      const result = await assignDiscountCodeAction(
        codeId,
        registrationId === UNASSIGNED ? null : registrationId,
      );
      if ("error" in result) {
        setAssignError(result.error);
        return;
      }
      refreshAll();
    });
  }

  function handleDelete(codeId: string) {
    startTransition(async () => {
      await deleteDiscountCodeAction(codeId);
      refreshAll();
    });
  }

  const list = codes ?? [];
  const assignedRegistrationIds = new Set(
    list.map((code) => code.registration_id).filter((id): id is string => !!id),
  );
  const availableRegistrants = (registrants ?? []).filter(
    (registrant) => !assignedRegistrationIds.has(registrant.id),
  );

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {assignError && (
        <Alert variant="destructive">
          <AlertDescription>{assignError}</AlertDescription>
        </Alert>
      )}

      {codes === undefined ? (
        <p className="app-muted text-sm">Loading discount codes...</p>
      ) : list.length === 0 && !showAdd ? (
        <p className="app-muted text-sm">
          No discount codes recorded for this event yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Assigned</TableHead>
              {mode === "edit" && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((code) => (
              <TableRow key={code.id}>
                <TableCell
                  className="max-w-xs truncate font-medium"
                  title={code.code}
                >
                  {code.code}
                </TableCell>
                <TableCell
                  className="max-w-xs truncate app-muted"
                  title={code.description ?? undefined}
                >
                  {code.description ?? "—"}
                </TableCell>
                <TableCell className="app-muted">
                  {code.source ?? "—"}
                </TableCell>
                <TableCell>
                  {mode === "edit" ? (
                    <Select
                      value={code.registration_id ?? UNASSIGNED}
                      onValueChange={(value) =>
                        handleAssign(code.id, value ?? UNASSIGNED)
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Unassigned">
                          {() =>
                            code.registration
                              ? code.registration.name
                              : "Unassigned"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {code.registration && (
                          <SelectItem value={code.registration.id}>
                            {code.registration.name}
                          </SelectItem>
                        )}
                        {availableRegistrants.map((registrant) => (
                          <SelectItem key={registrant.id} value={registrant.id}>
                            {registrant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : code.registration ? (
                    <span>
                      {code.registration.name}
                      <span className="app-muted block text-xs">
                        {code.registration.email}
                      </span>
                    </span>
                  ) : (
                    <span className="app-muted">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="app-muted whitespace-nowrap">
                  {code.assigned_at
                    ? dateFormatter.format(new Date(code.assigned_at))
                    : "—"}
                </TableCell>
                {mode === "edit" && (
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove code"
                      disabled={isPending}
                      onClick={() => handleDelete(code.id)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {mode === "edit" &&
        (showAdd ? (
          <AddCodesForm
            eventId={eventId}
            onSaved={() => {
              setShowAdd(false);
              refreshAll();
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAdd(true)}
          >
            + Add codes
          </Button>
        ))}
    </div>
  );
}
