"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatAmount } from "./expenses-shared";

export function ExpenseApprovalWorkflowInfo({ threshold }: { threshold: number | null }) {
  const [open, setOpen] = useState(true);
  const thresholdLabel = threshold !== null ? formatAmount(threshold, "USD") : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">How expense approval works</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
        >
          {open ? (
            <>
              <ChevronDown /> Hide
            </>
          ) : (
            <>
              <ChevronRight /> Show
            </>
          )}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="app-muted text-sm">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Submitted</strong> — finance or an event coordinator records
              an expense. Every expense starts here.
            </li>
            <li>
              <strong className="text-foreground">Approved or rejected</strong> —
              {thresholdLabel ? (
                <>
                  {" "}
                  below {thresholdLabel}, finance can approve their own submission. At or above that, an admin
                  or board member — someone other than whoever submitted it — has to approve or reject it.
                </>
              ) : (
                <> an admin or board member, other than whoever submitted it, approves or rejects it.</>
              )}
            </li>
            <li>
              <strong className="text-foreground">Paid</strong> — once approved, finance or admin marks it as
              paid after payment has actually been sent.
            </li>
          </ol>
          <p className="mt-3">
            The threshold is a setting, not a fixed rule — admin or board can change it anytime in{" "}
            <Link href="/portal/administration/system-settings" className="underline hover:text-foreground">
              Administration &gt; System Settings
            </Link>{" "}
            without a code change.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
