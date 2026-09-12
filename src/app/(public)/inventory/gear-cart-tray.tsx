"use client";

import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function GearCartTray({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:justify-end sm:pr-8">
      <Button type="button" size="lg" className="shadow-lg" onClick={onOpen}>
        <ShoppingCart aria-hidden />
        View cart
        <Badge variant="secondary">{count}</Badge>
      </Button>
    </div>
  );
}
