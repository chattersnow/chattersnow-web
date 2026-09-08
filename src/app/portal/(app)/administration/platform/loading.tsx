import { TablePageSkeleton } from "@/components/portal/page-skeleton";

export default function PlatformLoading() {
  return <TablePageSkeleton columns={7} action={false} toolbar={false} />;
}
