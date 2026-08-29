import {
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableCardSkeleton,
} from "@/components/portal/page-skeleton";

export default function InventoryReportsLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton />
      <TableCardSkeleton columns={8} />
    </>
  );
}
