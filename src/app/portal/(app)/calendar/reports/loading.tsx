import {
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableCardSkeleton,
} from "@/components/portal/page-skeleton";

export default function CalendarReportsLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton />
      <TableCardSkeleton columns={5} />
    </>
  );
}
