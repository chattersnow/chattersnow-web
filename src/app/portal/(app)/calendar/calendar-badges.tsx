import type { ReactNode } from "react";
import { AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES, DECISIONS, labelFor } from "./calendar-shared";

const CALENDAR_STATUS_STYLES: Record<string, string> = {
  idea: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  complete: "bg-secondary text-secondary-foreground",
  archived: "bg-muted text-muted-foreground",
};

const VISIBILITY_STYLES: Record<string, string> = {
  public: "bg-secondary text-secondary-foreground",
  internal: "bg-muted text-muted-foreground",
  unlisted_draft: "bg-primary/10 text-primary",
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Public",
  internal: "Internal",
  unlisted_draft: "Unlisted draft",
};

const PRIORITY_TIER_STYLES: Record<string, string> = {
  "1": "bg-destructive/10 text-destructive",
  "2": "bg-primary/10 text-primary",
  "3": "bg-muted text-muted-foreground",
};

const DECISION_STYLES: Record<string, string> = {
  plan: "bg-primary/10 text-primary",
  skip: "bg-muted text-muted-foreground",
  defer: "bg-secondary text-secondary-foreground",
};

function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CalendarStatusBadge({ status }: { status: string }) {
  return (
    <Pill
      className={
        CALENDAR_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      }
    >
      {status}
    </Pill>
  );
}

export function CalendarVisibilityBadge({
  visibility,
}: {
  visibility: string;
}) {
  return (
    <Pill
      className={
        VISIBILITY_STYLES[visibility] ?? "bg-muted text-muted-foreground"
      }
    >
      {VISIBILITY_LABELS[visibility] ?? visibility}
    </Pill>
  );
}

export function PriorityTierBadge({ tier }: { tier: number }) {
  return (
    <Pill
      className={
        PRIORITY_TIER_STYLES[String(tier)] ?? "bg-muted text-muted-foreground"
      }
    >
      Tier {tier}
    </Pill>
  );
}

export function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) {
    return <Pill className="bg-muted text-muted-foreground">No decision</Pill>;
  }
  return (
    <Pill
      className={DECISION_STYLES[decision] ?? "bg-muted text-muted-foreground"}
    >
      {labelFor(DECISIONS, decision)}
    </Pill>
  );
}

export function CategoryBadges({ categories }: { categories: string[] }) {
  if (categories.length === 0)
    return <span className="app-muted text-sm">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((category) => (
        <Pill
          key={category}
          className="bg-muted text-muted-foreground normal-case"
        >
          {labelFor(CATEGORIES, category)}
        </Pill>
      ))}
    </div>
  );
}

export function NeedsDecisionFlag() {
  return (
    <span
      title="Tier 1 moment with no plan, skip, or defer decision"
      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
    >
      <AlertTriangle className="size-3" />
      Needs a decision
    </span>
  );
}

export function SensitiveTopicBadge({ reviewed }: { reviewed: boolean }) {
  return (
    <Pill
      className={
        reviewed
          ? "bg-secondary text-secondary-foreground"
          : "bg-destructive/10 text-destructive"
      }
    >
      {reviewed ? "Sensitive topic — reviewed" : "Sensitive topic"}
    </Pill>
  );
}

export function NeedsSensitiveReviewFlag() {
  return (
    <span
      title="This is a flagged sensitive-topic moment with no reviewer sign-off yet"
      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
    >
      <ShieldAlert className="size-3" />
      Needs sensitive-topic review
    </span>
  );
}

export function PastUndecidedFlag() {
  return (
    <span
      title="This moment has already passed with no plan, skip, or defer decision recorded"
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
    >
      <Clock className="size-3" />
      Past, undecided
    </span>
  );
}
