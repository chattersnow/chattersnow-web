import Image from "next/image";
import { ImageOff } from "lucide-react";
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
}: {
  item: GearItem;
  onSelect: () => void;
  inCart: boolean;
  onToggleCart: () => void;
}) {
  const genderLabel = labelFor(GENDERS, item.gender);
  const imageUrl = resolveImageUrl(item.photo_url);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer gap-0 overflow-hidden py-0 transition-colors hover:border-[var(--purple-deep)]"
    >
      <div className="relative aspect-square w-full bg-muted">
        <div
          className="absolute top-2 left-2 z-10 flex size-6 items-center justify-center rounded-md bg-background/80 backdrop-blur-xs"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={inCart}
            onCheckedChange={() => onToggleCart()}
            aria-label={inCart ? "Remove from cart" : "Add to cart"}
          />
        </div>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.description}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="size-8 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <CardContent className="space-y-1.5 px-4 py-3">
        <p className="line-clamp-2 text-sm font-medium">{item.description}</p>
        <p className="app-muted text-xs">
          {[item.type, item.size, genderLabel].filter(Boolean).join(" · ")}
        </p>
        <p className="text-xs text-muted-foreground">
          {labelFor(CONDITIONS, item.condition)}
        </p>
      </CardContent>
    </Card>
  );
}
