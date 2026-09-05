"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActionToast } from "@/components/portal/action-toast";
import {
  runRetentionDryRunAction,
  setRetentionPolicyModeAction,
} from "./actions";
import type { RetentionPolicyRow } from "./retention-query";

const MODE_LABEL: Record<RetentionPolicyRow["mode"], string> = {
  off: "Off",
  dry_run: "Preview only",
  enforce: "Enforcing",
};

const MODE_VARIANT: Record<
  RetentionPolicyRow["mode"],
  "secondary" | "outline" | "default"
> = {
  off: "outline",
  dry_run: "secondary",
  enforce: "default",
};

/**
 * Turns an interval as Postgres renders it ("2 years", "7 days") into the same
 * words a person would use. Kept dumb on purpose: the periods are a board
 * decision and the seed writes them in this shape, so anything cleverer would
 * be inventing a format nobody asked for.
 */
function formatPeriod(period: string) {
  return period.replace(/^1 (year|month|day)s?$/, "1 $1");
}

export function RetentionPoliciesPanel({
  policies,
}: {
  policies: RetentionPolicyRow[];
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();

  function changeMode(policy: RetentionPolicyRow, mode: string) {
    run(() => setRetentionPolicyModeAction(policy.policy_key, mode), {
      success: `${policy.label}: ${MODE_LABEL[mode as RetentionPolicyRow["mode"]].toLowerCase()}.`,
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Retention rules</h2>
            <p className="app-muted mt-1 text-sm leading-relaxed">
              The periods published at <code>/privacy</code>. A rule in preview
              records what it would remove without removing anything — review a
              few nights of counts below before you set one to enforcing.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(runRetentionDryRunAction, {
                success: "Preview run finished.",
                description: "Its counts are in the run history below.",
                onSuccess: () => router.refresh(),
              })
            }
          >
            Run a preview now
          </Button>
        </div>

        <ul className="divide-y divide-[--color-line]">
          {policies.map((policy) => (
            <li
              key={policy.policy_key}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="sm:pr-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{policy.label}</span>
                  <Badge variant={MODE_VARIANT[policy.mode]}>
                    {MODE_LABEL[policy.mode]}
                  </Badge>
                </div>
                <p className="app-muted mt-1 text-sm leading-relaxed">
                  Kept for {formatPeriod(policy.period)}
                  {policy.secondary_period
                    ? `, or ${formatPeriod(policy.secondary_period)} when declined or closed`
                    : ""}
                  . {policy.description}
                </p>
              </div>
              <Select
                value={policy.mode}
                onValueChange={(mode) => mode && changeMode(policy, mode)}
                disabled={isPending}
              >
                <SelectTrigger
                  className="sm:w-44"
                  aria-label={`Mode for ${policy.label}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="dry_run">Preview only</SelectItem>
                  <SelectItem value="enforce">Enforcing</SelectItem>
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
