"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CONDITIONS,
  GENDERS,
  labelFor,
  resolveImageUrl,
} from "@/lib/inventory";
import { GearRequestForm } from "./gear-request-form-fields";
import type { GearItem } from "./gear-catalog";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export function GearDetailSheet({
  item,
  open,
  onOpenChange,
}: {
  item: GearItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const genderLabel = item ? labelFor(GENDERS, item.gender) : null;
  const imageUrl = item ? resolveImageUrl(item.photo_url) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        {item && (
          <>
            <SheetHeader>
              <p className="app-eyebrow">{item.type}</p>
              <SheetTitle className="text-xl">{item.description}</SheetTitle>
              <SheetDescription>
                {[item.size, genderLabel, labelFor(CONDITIONS, item.condition)]
                  .filter(Boolean)
                  .join(" · ")}
                {" · "}
                Available since{" "}
                {dateFormatter.format(new Date(item.created_at))}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={item.description}
                    fill
                    sizes="(min-width: 640px) 28rem, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff
                      className="size-10 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                )}
              </div>

              <h3 className="brand-display mt-6 text-lg font-semibold tracking-[-0.02em]">
                Request this item
              </h3>
              <div className="mt-4">
                <GearRequestForm itemId={item.id} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
