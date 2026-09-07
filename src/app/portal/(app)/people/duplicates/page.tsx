import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { personDisplayName } from "@/lib/format";
import {
  getMergeBlockersAction,
  getMergeCandidatesAction,
  getMergePreviewAction,
  listDuplicatePeopleAction,
} from "./actions";
import type { DuplicatePerson } from "./merge-shared";
import { MergeReview } from "./merge-review";

export const metadata: Metadata = {
  title: "Duplicate people",
};

function groupByEmail(rows: DuplicatePerson[]) {
  const groups = new Map<string, DuplicatePerson[]>();
  for (const row of rows) {
    const existing = groups.get(row.email_key);
    if (existing) existing.push(row);
    else groups.set(row.email_key, [row]);
  }
  return [...groups.entries()];
}

export default async function DuplicatePeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  // The people layout only requires people:view; merging is a manage action.
  await requirePermission(supabase, "people", "manage", "People");

  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const survivorId = one("survivor");
  const duplicateId = one("duplicate");

  const result = await listDuplicatePeopleAction();

  // Only when a pair is actually under review; the list itself needs neither.
  const reviewing = survivorId && duplicateId;
  const [blockers, preview, candidates] = reviewing
    ? await Promise.all([
        getMergeBlockersAction(survivorId, duplicateId),
        getMergePreviewAction(survivorId, duplicateId),
        getMergeCandidatesAction([survivorId, duplicateId]),
      ])
    : [null, null, null];

  return (
    <>
      <PortalBreadcrumbs current="Duplicates" />

      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Duplicates
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-4 max-w-2xl">
        Records that share an email address. Merging moves every donation,
        registration, signup and note onto the record you keep, then deletes the
        other one. It cannot be undone.
      </p>

      {"error" in result ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : reviewing ? (
        blockers && "error" in blockers ? (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{blockers.error}</AlertDescription>
          </Alert>
        ) : (
          <MergeReview
            survivorId={survivorId}
            duplicateId={duplicateId}
            people={candidates && "data" in candidates ? candidates.data : []}
            blockers={blockers?.data ?? []}
            preview={preview && "data" in preview ? preview.data : []}
          />
        )
      ) : result.data.length === 0 ? (
        <Empty className="mt-6 border">
          <EmptyHeader>
            <EmptyTitle>No duplicates</EmptyTitle>
          </EmptyHeader>
          <p className="app-muted">
            Every person with an email address has a unique one.
          </p>
        </Empty>
      ) : (
        <div className="mt-6 grid gap-4">
          {groupByEmail(result.data).map(([email, members]) => (
            <Card key={email}>
              <CardHeader>
                <CardTitle className="font-mono text-base">{email}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {members.map((person) => (
                  <div
                    key={person.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/portal/people/${person.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {personDisplayName(person)}
                      </Link>
                      <div className="app-muted mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <span>
                          Added{" "}
                          {new Date(person.created_at).toLocaleDateString()}
                        </span>
                        {person.person_type === "organization" && (
                          <Badge variant="secondary">Organization</Badge>
                        )}
                        {person.auth_user_id && (
                          <Badge variant="secondary">Portal user</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {members
                        .filter((other) => other.id !== person.id)
                        .map((other) => (
                          <Button
                            key={other.id}
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={
                              <Link
                                href={`/portal/people/duplicates?survivor=${person.id}&duplicate=${other.id}`}
                              />
                            }
                          >
                            Keep this one
                          </Button>
                        ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
