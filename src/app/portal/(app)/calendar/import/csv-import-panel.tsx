"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseCalendarImportCsv,
  type CalendarImportRow,
} from "./calendar-import-row";
import { bulkImportCalendarItemsAction } from "./actions";
import { Spinner } from "@/components/ui/spinner";

export function CsvImportPanel() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [source, setSource] = useState("");
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<
    ({ data: CalendarImportRow } | { error: string })[]
  >([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validRows = rows.filter(
    (row): row is { data: CalendarImportRow } => "data" in row,
  );
  const errorRows = rows.filter(
    (row): row is { error: string } => "error" in row,
  );

  function handleParse() {
    setSubmitError(null);
    setSuccessMessage(null);
    const { rows: parsedRows } = parseCalendarImportCsv(csvText);
    setRows(parsedRows);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setSubmitError(null);
    setSuccessMessage(null);
    const { rows: parsedRows } = parseCalendarImportCsv(text);
    setRows(parsedRows);
  }

  function handleSubmit() {
    setSubmitError(null);
    startTransition(async () => {
      const result = await bulkImportCalendarItemsAction(
        source,
        validRows.map((row) => row.data),
      );
      if ("error" in result) {
        setSubmitError(result.error);
        return;
      }
      setSuccessMessage(
        `Imported ${result.insertedCount} item${result.insertedCount === 1 ? "" : "s"} as drafts.`,
      );
      setRows([]);
      setCsvText("");
      router.refresh();
    });
  }

  const canSubmit =
    source.trim().length > 0 && validRows.length > 0 && !isPending;

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="import-source">Source</FieldLabel>
        <Input
          id="import-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="e.g. GLAAD 2027 calendar"
        />
        <p className="app-muted text-xs">
          Applied to every row in this upload — traceable provenance for where
          the list came from.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor="import-file">CSV file</FieldLabel>
        <Input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="import-textarea">Or paste CSV</FieldLabel>
        <Textarea
          id="import-textarea"
          rows={6}
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder="title,item_type,starts_at,ends_at,time_zone,recurrence_rule,priority_tier,category,region"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleParse}
        >
          Parse
        </Button>
      </Field>

      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="app-muted text-sm">
            {validRows.length} valid row{validRows.length === 1 ? "" : "s"}
            {errorRows.length > 0 &&
              `, ${errorRows.length} row${errorRows.length === 1 ? "" : "s"} skipped`}
          </p>

          {errorRows.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-inside list-disc">
                  {errorRows.map((row) => (
                    <li key={row.error}>{row.error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validRows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Region</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validRows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.data.title}</TableCell>
                    <TableCell>{row.data.startsAt.slice(0, 10)}</TableCell>
                    <TableCell>Tier {row.data.priorityTier}</TableCell>
                    <TableCell>{row.data.category}</TableCell>
                    <TableCell>{row.data.region ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
      {successMessage && (
        <Alert>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
        {isPending ? (
          <>
            <Spinner /> Importing…
          </>
        ) : (
          `Import ${validRows.length} item${validRows.length === 1 ? "" : "s"} as drafts`
        )}
      </Button>
    </FieldGroup>
  );
}
