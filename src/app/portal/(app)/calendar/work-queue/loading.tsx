import { TablePageSkeleton } from "@/components/portal/page-skeleton";

export default function WorkQueueLoading() {
  return <TablePageSkeleton columns={6} action={false} />;
}
