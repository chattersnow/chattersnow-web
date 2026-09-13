import { Skeleton } from "@/components/ui/skeleton";

export default function TeamLoading() {
  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent mb-4 w-full" />
        <Skeleton className="h-10 w-48 sm:h-12" />
      </div>
      <Skeleton className="mt-6 aspect-[21/9] w-full rounded-2xl" />

      {/* Deliberately settings-agnostic, at the registry default: the card
          grid. `layout.team_layout` decides what actually renders (#917), but
          a Suspense fallback has to render synchronously, and awaiting the
          setting would hold the whole skeleton -- heading and hero included --
          to tidy a swap only tenants who chose rows ever see. */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-[var(--line)] p-6"
          >
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
