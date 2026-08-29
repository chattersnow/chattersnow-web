import {
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableCardSkeleton,
} from "@/components/portal/page-skeleton";

export default function ProgramReportsLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton />
      <TableCardSkeleton columns={3} />
    </>
  );
}
