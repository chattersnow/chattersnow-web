"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { updateContactMessageStatusAction } from "./actions";
import {
  CONTACT_MESSAGE_STATUSES,
  type ContactMessage,
  type ContactMessageStatus,
} from "./message-types";
import { CONTACT_TOPIC_LABELS } from "./message-badges";
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function MessageDetailsSheet({
  message,
  canManage,
}: {
  message: ContactMessage;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeStatus(status: ContactMessageStatus, refresh: boolean) {
    startTransition(async () => {
      if (refresh) setError(null);
      const result = await updateContactMessageStatusAction(message.id, status);
      if ("error" in result) {
        if (refresh) setError(result.error);
        return;
      }
      if (refresh) router.refresh();
    });
  }

  // Opening a new message marks it read automatically -- staff shouldn't
  // have to make a separate click just to acknowledge they've seen it.
  useEffect(() => {
    if (open && canManage && message.status === "new") {
      changeStatus("read", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`View message from ${message.name}`}
          />
        }
      >
        <Eye />
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false}>
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <SheetClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
              />
            }
          >
            <ArrowLeft />
          </SheetClose>
          <div className="flex flex-1 flex-col gap-0.5">
            <SheetTitle>Contact message</SheetTitle>
            <SheetDescription>
              Submitted {dateFormatter.format(new Date(message.created_at))}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <FieldGroup>
            <ReadOnlyField label="Name" htmlFor="message-name">
              {message.name}
            </ReadOnlyField>
            <ReadOnlyField label="Email" htmlFor="message-email">
              {message.email}
            </ReadOnlyField>
            <ReadOnlyField label="Topic" htmlFor="message-topic">
              {CONTACT_TOPIC_LABELS[message.topic] ?? message.topic}
            </ReadOnlyField>
            <ReadOnlyField label="Message" htmlFor="message-body">
              <span className="whitespace-pre-wrap">{message.message}</span>
            </ReadOnlyField>

            {canManage ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Status</span>
                <Select
                  value={message.status}
                  onValueChange={(value) =>
                    value && changeStatus(value as ContactMessageStatus, true)
                  }
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_MESSAGE_STATUSES.map((status) => (
                      <SelectItem
                        key={status}
                        value={status}
                        className="capitalize"
                      >
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <ReadOnlyField label="Status" htmlFor="message-status">
                {message.status}
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
