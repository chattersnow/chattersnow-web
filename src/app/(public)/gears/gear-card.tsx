import Image from "next/image";
import { ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  CONDITIONS,
  GENDERS,
  labelFor,
  resolveImageUrl,
} from "@/lib/inventory";
import type { GearItem } from "./gear-catalog";

export function GearCard({ item }: { item: GearItem }) {
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
