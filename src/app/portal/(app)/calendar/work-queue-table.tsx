import { formatDueRelative } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarItemDetailsSheet } from "./calendar-item-details-sheet";
import {
  NeedsDecisionFlag,
  PastUndecidedFlag,
  PriorityTierBadge,
} from "./calendar-badges";
import {
  ContentOverdueFlag,
  ChangesRequestedFlag,
  ContentStatusBadge,
} from "./content-opportunity-badges";
import {
  isPastUndecided,
  labelFor,
  needsDecision,
  ownerEmail,
  ITEM_TYPES,
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "./calendar-shared";
import {
  effectiveDueDate,
  isChangesRequestedForMe,
  overdueStage,
} from "./content-opportunity-shared";
import type { ActiveContentBriefTemplate } from "./content-brief-template-shared";
import type { ProgramSuggestionRule } from "./program-suggestion-shared";

export function WorkQueueTable({
  items,
  owners,
  programs,
  activeTemplates,
  defaultLeadTimeDays,
  programSuggestionRules,
  canManage,
  currentUserId,
  emptyMessage,
}: {
  items: CalendarItemRow[];
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  activeTemplates: ActiveContentBriefTemplate[];
  defaultLeadTimeDays: number;
  programSuggestionRules: ProgramSuggestionRule[];
  canManage: boolean;
  currentUserId: string | null;
  emptyMessage: string;
}) {
  return (
    <Card className="mt-3">
      <CardContent className="px-0">
        {items.length === 0 ? (
          <p className="app-muted px-4 py-6 text-sm">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Content status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const opp = item.content_opportunity;
                const dueDate = opp ? effectiveDueDate(opp) : null;
                const stage = opp ? overdueStage(opp) : null;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-xs font-medium">
                      <div className="flex flex-col gap-1">
                        <span className="block truncate" title={item.title}>
                          {item.title}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {needsDecision(item) && <NeedsDecisionFlag />}
                          {isPastUndecided(item) && <PastUndecidedFlag />}
                          {stage && <ContentOverdueFlag stage={stage} />}
                          {opp &&
                            currentUserId &&
                            isChangesRequestedForMe(opp, currentUserId) && (
                              <ChangesRequestedFlag />
                            )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="app-muted">
                      {labelFor(ITEM_TYPES, item.item_type)}
                    </TableCell>
                    <TableCell>
                      <PriorityTierBadge tier={item.priority_tier} />
                    </TableCell>
                    <TableCell>
                      {opp ? (
                        <ContentStatusBadge status={opp.content_status} />
                      ) : (
                        <span className="app-muted text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="app-muted">
                      {dueDate ? formatDueRelative(dueDate) : "—"}
                    </TableCell>
                    <TableCell className="app-muted">
                      {ownerEmail(owners, item.owner_id)}
                    </TableCell>
                    <TableCell className="app-muted">
                      {opp ? ownerEmail(owners, opp.reviewer_id) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <CalendarItemDetailsSheet
                        item={item}
                        owners={owners}
                        programs={programs}
                        activeTemplates={activeTemplates}
                        defaultLeadTimeDays={defaultLeadTimeDays}
                        programSuggestionRules={programSuggestionRules}
                        canManage={canManage}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
