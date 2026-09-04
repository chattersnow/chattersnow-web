import Image from "next/image";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import { Card, CardContent } from "@/components/ui/card";
import { EditInventoryModal } from "./edit-inventory-modal";
import {
  CONDITIONS,
  GENDERS,
  IntendedUseBadge,
  StatusBadge,
  formatFaceValue,
  labelFor,
  resolveImageUrl,
  type InventoryItem,
} from "./inventory-shared";

export function InventoryCard({ item }: { item: InventoryItem }) {
  const genderLabel = labelFor(GENDERS, item.gender);
  const imageUrl = resolveImageUrl(item.photo_url);

  return (
    <Card className="gap-0 overflow-hidden py-0">
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
          <BrandImageFallback label="No photo" />
        )}
      </div>
      <CardContent className="space-y-1.5 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-medium">{item.description}</p>
          <EditInventoryModal item={item} />
        </div>
        <p className="app-muted text-xs">
          {[item.type, item.size, genderLabel].filter(Boolean).join(" · ")}
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {labelFor(CONDITIONS, item.condition)}
          </span>
          <span className="text-sm font-semibold">
            {formatFaceValue(item.face_value)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={item.status} />
          <IntendedUseBadge intendedUse={item.intended_use} />
        </div>
      </CardContent>
    </Card>
  );
}
