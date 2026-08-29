import { TablePageSkeleton } from "@/components/portal/page-skeleton";

export default function PermissionsLoading() {
  return <TablePageSkeleton columns={3} action={false} toolbar={false} />;
}
