"use client";

import { createPortal } from "react-dom";
import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";

export function TabNavOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
      <Spinner className="size-8" />
    </div>,
    document.body,
  );
}
