import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const CELL_WIDTHS = ["w-24", "w-16", "w-28", "w-20", "w-24", "w-16"];

export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <>
      <div className="rainbow-accent w-16" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-48" />
        {action ? <Skeleton className="h-8 w-32" /> : null}
      </div>
    </>
  );
}

export function ToolbarSkeleton() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-8 w-24" />
    </div>
  );
}

export function TableCardSkeleton({
  columns = 5,
  rows = 5,
  className,
}: {
  columns?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("mt-6", className)}>
      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: columns }).map((_, index) => (
                  <TableHead key={index}>
                    <Skeleton
                      className={cn(
                        "h-4",
                        CELL_WIDTHS[index % CELL_WIDTHS.length],
                      )}
                    />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: rows }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: columns }).map((_, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton
                        className={cn(
                          "h-4",
                          CELL_WIDTHS[
                            (cellIndex + rowIndex) % CELL_WIDTHS.length
                          ],
                        )}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function StatCardsSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FieldCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TablePageSkeleton({
  columns = 5,
  rows = 5,
  action = true,
  toolbar = true,
}: {
  columns?: number;
  rows?: number;
  action?: boolean;
  toolbar?: boolean;
}) {
  return (
    <>
      <PageHeaderSkeleton action={action} />
      {toolbar ? <ToolbarSkeleton /> : null}
      <TableCardSkeleton columns={columns} rows={rows} />
    </>
  );
}

export function DetailPageSkeleton({
  fieldCards = 2,
  sections = 0,
}: {
  fieldCards?: number;
  sections?: number;
}) {
  return (
    <>
      <div className="rainbow-accent w-16" />
      <Skeleton className="mb-2 h-5 w-24" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Skeleton className="h-10 w-64" />
          <div className="mt-2 flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-20" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: fieldCards }).map((_, index) => (
          <FieldCardSkeleton key={index} rows={index === 0 ? 4 : 3} />
        ))}
      </div>

      {Array.from({ length: sections }).map((_, index) => (
        <div key={index} className="mt-6">
          <Skeleton className="h-3 w-24" />
          <div className="mt-3">
            <Card>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          </div>
        </div>
      ))}
    </>
  );
}
