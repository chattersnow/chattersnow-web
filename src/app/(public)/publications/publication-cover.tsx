import type { PublicationImage } from "@/lib/publications";
import { cn } from "@/lib/utils";

/**
 * An issue's cover, or its title set in type when it has none. A plain `<img>`
 * rather than `next/image`: the sizes were made at upload (#1472), so the
 * browser picks from `srcSet` without a Vercel transformation per width.
 */
export function PublicationCover({
  cover,
  title,
  sizes,
  className,
  priority = false,
}: {
  cover: PublicationImage | null;
  title: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  if (!cover) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "flex aspect-[1/1.414] items-end overflow-hidden rounded-xl bg-muted p-5",
          className,
        )}
      >
        <span className="brand-display line-clamp-4 text-2xl font-semibold tracking-brand break-words">
          {title}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- sized at upload; see the comment above
    <img
      src={cover.url}
      srcSet={cover.srcSet}
      sizes={cover.srcSet ? sizes : undefined}
      width={cover.width}
      height={cover.height}
      alt=""
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn(
        "h-auto w-full rounded-xl border border-[var(--line)] bg-muted object-cover",
        className,
      )}
    />
  );
}
