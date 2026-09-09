-- #838: `content_opportunities.chatter_connection` stops naming one client.
--
-- The column holds the answer to "why does this matter to us?" on a content
-- brief -- the stated reason an organization is publishing about an observance
-- or moment. It is a platform concept with one client's name on it, and it
-- reached every tenant three times over: as the field label "Chatter
-- connection", as the placeholder "What's the specific Chatter connection?",
-- and inside the validation message a user sees when they leave it empty.
--
-- Renamed to `org_connection`. "Organization" is what the rest of the schema
-- calls a tenant in prose, and the word survives translation to any customer;
-- `relevance` was the alternative and was rejected as describing the field
-- rather than the relationship it records.
--
-- Nothing about the data changes. `alter ... rename column` preserves every
-- row, index, policy and grant, so this is safe on a hosted project with
-- content briefs already written.

alter table public.content_opportunities
  rename column chatter_connection to org_connection;

comment on column public.content_opportunities.org_connection is
  'Why this content matters to the organization publishing it -- the stated connection between the moment and their work. Required once a brief moves past the initial statuses. Renamed from chatter_connection in #838.';

-- The one deployed function that names the column. It builds the annual review
-- payload as jsonb, so the key is part of the API the report reads and both
-- halves have to move together.
--
-- `alter table ... rename column` does not rewrite function bodies: a
-- security-definer function referring to `chatter_connection` would simply
-- start failing at run time. And the function lives in a migration that has
-- already run, so editing that file would change nothing -- it is replaced
-- here, byte-for-byte the same body with the one key and one column reference
-- renamed. The signature is unchanged, so the existing
-- `grant execute ... to authenticated` from 20260905040000 still applies.
create or replace function public.get_calendar_annual_review_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_ids uuid[];
  v_result jsonb;
begin
  if not public.has_permission('content_calendar_reports', 'view') then
    raise exception 'Not authorized to view the annual calendar review report';
  end if;

  if p_from > p_to then
    raise exception 'The start of the range must not be after its end';
  end if;

  select coalesce(array_agg(id), '{}') into v_item_ids
  from public.calendar_items
  where tenant_id = (select public.current_tenant_id())
    and starts_at >= (p_from::timestamp at time zone 'UTC')
    and starts_at < ((p_to + 1)::timestamp at time zone 'UTC');

  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'priority_tier', priority_tier,
        'decision', decision,
        'visibility', visibility,
        'calendar_status', calendar_status
      ))
      from public.calendar_items
      where id = any(v_item_ids)
    ), '[]'::jsonb),
    'opportunities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'calendar_item_id', calendar_item_id,
        'content_status', content_status,
        'org_connection', org_connection,
        'template_id', template_id,
        'draft_due_at', draft_due_at,
        'review_due_at', review_due_at,
        'publish_due_at', publish_due_at,
        'created_at', created_at,
        'status_changed_at', status_changed_at
      ))
      from public.content_opportunities
      where calendar_item_id = any(v_item_ids)
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'content_opportunity_id', p.content_opportunity_id
      ))
      from public.content_permissions p
      join public.content_opportunities co on co.id = p.content_opportunity_id
      where co.calendar_item_id = any(v_item_ids)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;