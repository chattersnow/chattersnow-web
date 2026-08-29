import {
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableCardSkeleton,
} from "@/components/portal/page-skeleton";

export default function FinanceReportsLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton />
      <TableCardSkeleton columns={6} />
    </>
  );
}
