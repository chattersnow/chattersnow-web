import {
  FieldCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/portal/page-skeleton";

export default function SiteContentLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <FieldCardSkeleton rows={6} />
    </div>
  );
}
