-- Issue #108: work-queue/overdue/Tier-1-undecided queries filter and sort on
-- these columns; neither table has had an index added since creation.
create index calendar_items_owner_id_idx on public.calendar_items (owner_id);

create index calendar_items_priority_tier_decision_idx
  on public.calendar_items (priority_tier, decision)
  where calendar_status <> 'archived';

create index content_opportunities_owner_id_idx
  on public.content_opportunities (owner_id);

create index content_opportunities_reviewer_id_idx
  on public.content_opportunities (reviewer_id);

create index content_opportunities_content_status_idx
  on public.content_opportunities (content_status);
