import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewProgramDialog } from "./new-program-dialog";
import { ProgramDetailsDialog } from "./program-details-dialog";
import { ProgramStatusBadge, type ProgramRow } from "./program-badges";

export default async function ProgramsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "programs", "manage");

  const { data: programs, error } = await supabase
    .from("programs")
    .select("id, name, description, status")
    .order("name", { ascending: true });

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Programs
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Named, repeatable initiatives that events roll up into — assign an event
        to a program from the event&rsquo;s Overview tab.
      </p>

      {canManage ? (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <NewProgramDialog />
        </div>
      ) : null}

      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load programs. Please try again.
            </p>
          ) : !programs || programs.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">No programs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(programs as ProgramRow[]).map((program) => (
                  <TableRow key={program.id}>
                    <TableCell className="font-medium">
                      {program.name}
                    </TableCell>
                    <TableCell className="app-muted max-w-sm truncate">
                      {program.description || "—"}
                    </TableCell>
                    <TableCell>
                      <ProgramStatusBadge status={program.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <ProgramDetailsDialog
                        program={program}
                        canManage={canManage}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
