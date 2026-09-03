import {
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableCardSkeleton,
  ToolbarSkeleton,
} from "@/components/portal/page-skeleton";

export default function AttendeesLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      {/* Two stat tiles sit above the toolbar here, unlike the other
          directories, so this can't use TablePageSkeleton as-is. */}
      <StatCardsSkeleton count={2} className="sm:grid-cols-2 lg:grid-cols-2" />
      <ToolbarSkeleton />
      <TableCardSkeleton columns={4} />
    </>
  );
}
