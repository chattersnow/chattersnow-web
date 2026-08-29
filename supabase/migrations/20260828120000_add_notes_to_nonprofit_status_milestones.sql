-- Add a free-text notes field to nonprofit status milestones, for context
-- (blockers, decisions, links) that doesn't fit the structured fields.

alter table public.nonprofit_status_milestones add column notes text;
