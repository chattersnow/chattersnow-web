import { TablePageSkeleton } from "@/components/portal/page-skeleton";

export default function AuditLogLoading() {
  return <TablePageSkeleton columns={5} action={false} />;
}
