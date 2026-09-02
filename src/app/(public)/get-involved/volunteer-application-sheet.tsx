"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { VolunteerApplicationForm } from "./volunteer-application-form-fields";

export function VolunteerApplicationSheet() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>Apply to volunteer</SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="text-xl">Apply to volunteer</SheetTitle>
          <SheetDescription>
            Tell us a bit about yourself and we&apos;ll follow up about getting
            you plugged in.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <VolunteerApplicationForm />
        </div>
      </SheetContent>
    </Sheet>
  );
}
