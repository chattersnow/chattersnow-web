"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { updateVolunteerApplicationStatusAction } from "./actions";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerApplication,
  type VolunteerApplicationStatus,
} from "./application-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { humanizeStatus } from "@/components/portal/status-badge";
import { formatDateTime } from "@/lib/format";

// Base UI's Select.Value shows the raw value unless Root is told the labels,
// so the trigger reads "Placed" like the option (and the badge) rather than
// "placed".
const APPLICATION_STATUS_ITEMS = VOLUNTEER_APPLICATION_STATUSES.map(
  (status) => ({ value: status, label: humanizeStatus(status) }),
);

export function VolunteerApplicationDetailsSheet({
  application,
  canManage,
}: {
  application: VolunteerApplication;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(status: string | null) {
    if (!status) return;
    setError(null);
    startTransition(async () => {
      const result = await updateVolunteerApplicationStatusAction(
        application.id,
        status as VolunteerApplicationStatus,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Application updated.");
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <SheetTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`View application from ${application.name}`}
                />
              }
            />
          }
        >
          <Eye />
        </SheetTrigger>
        <TooltipContent>{`View application from ${application.name}`}</TooltipContent>
      </Tooltip>
      <SheetContent side="right" showCloseButton={false}>
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <Tooltip>
            <SheetClose
              render={
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close"
                    />
                  }
                />
              }
            >
              <ArrowLeft />
            </SheetClose>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
          <div className="flex flex-1 flex-col gap-0.5">
            <SheetTitle>Volunteer application</SheetTitle>
            <SheetDescription>
              Submitted {formatDateTime(application.created_at)}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <FieldGroup>
            <ReadOnlyField label="Name" htmlFor="application-name">
              {application.name}
            </ReadOnlyField>
            <ReadOnlyField label="Email" htmlFor="application-email">
              {application.email}
            </ReadOnlyField>
            <ReadOnlyField label="Phone" htmlFor="application-phone">
              {application.phone || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Pronouns" htmlFor="application-pronouns">
              {application.pronouns || "—"}
            </ReadOnlyField>
            <ReadOnlyField
              label="Role interest"
              htmlFor="application-role-interest"
            >
              {application.role_interest || "—"}
            </ReadOnlyField>
            <ReadOnlyField
              label="Availability"
              htmlFor="application-availability"
            >
              {application.availability || "—"}
            </ReadOnlyField>

            {canManage ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Status</span>
                <Select
                  value={application.status}
                  items={APPLICATION_STATUS_ITEMS}
                  onValueChange={handleStatusChange}
                  disabled={isPending}
                >
                  <SelectTrigger aria-label="Application status">
                    {isPending ? <Spinner /> : null}
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLICATION_STATUS_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <ReadOnlyField label="Status" htmlFor="application-status">
                {humanizeStatus(application.status)}
              </ReadOnlyField>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}
