import { categoryLabelFor } from "@/lib/inventory";
import Image from "next/image";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CONDITIONS,
  GENDERS,
  labelFor,
  resolveImageUrl,
} from "@/lib/inventory";
import type { GearItem } from "./gear-catalog";

export function GearCard({
  item,
  onSelect,
  inCart,
  onToggleCart,
  placeholderUrl,
}: {
  item: GearItem;
  onSelect: () => void;
  inCart: boolean;
  onToggleCart: () => void;
  placeholderUrl: string | null;
}) {
  const genderLabel = labelFor(GENDERS, item.gender);
  const imageUrl = resolveImageUrl(item.photo_url) ?? placeholderUrl;

  return (
    <Card className="rainbow-ring-hover relative gap-0 overflow-hidden py-0">
      <button
        type="button"
        onClick={onSelect}
        aria-label={`View details for ${item.description}`}
        className="flex w-full cursor-pointer flex-col text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <div className="relative aspect-square w-full bg-muted">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={item.description}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover"
            />
          ) : (
            <BrandImageFallback label="Photo coming soon" />
          )}
        </div>
        <CardContent className="space-y-1.5 px-4 py-3">
          <p className="line-clamp-2 text-sm font-medium">{item.description}</p>
          <p className="app-muted text-xs">
            {[categoryLabelFor(item), item.size, genderLabel]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {labelFor(CONDITIONS, item.condition)}
          </p>
        </CardContent>
      </button>
      <div className="absolute top-2 left-2 z-10 flex size-6 items-center justify-center rounded-md bg-background/80 backdrop-blur-xs">
        <Checkbox
          checked={inCart}
          onCheckedChange={() => onToggleCart()}
          aria-label={inCart ? "Remove from cart" : "Add to cart"}
        />
      </div>
    </Card>
  );
}
