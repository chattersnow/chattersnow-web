-- #1648: who has been added to the event's group chat.
--
-- Chatter Snow adds every registrant -- not only the ones who carpool -- to an
-- Instagram group chat for the event, and tracked who was in it somewhere
-- outside the portal. This brings that list onto the registrants table.
--
-- THE SWITCH. `events.group_chat_enabled`, off by default, with an optional
-- `group_chat_label` ("Instagram group chat"; blank reads "Group chat"). Off,
-- nothing about a group chat shows anywhere. Turning it off keeps the flags,
-- so turning it back on loses nothing.
--
-- THE FLAG. `event_registrations.group_chat_added_at` and `_by`. Staff only:
-- no registrant-facing read selects them, and they are not a promise to the
-- registrant. A cancelled registration keeps its flag, which is how staff see
-- who to take back out of the chat.
--
-- `_by` references auth.users, like every other `*_by` column, and not
-- people: a second foreign key from event_registrations to people would make
-- every bare `people(...)` embed of it ambiguous (PGRST201). The name shown
-- beside it comes from event_group_chat_adders() below.
--
-- Not audited per toggle: it is an operational flag, like an answer, and
-- `_by` records who set it.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.events
  add column group_chat_enabled boolean not null default false,
  add column group_chat_label text
    constraint events_group_chat_label_length
      check (char_length(group_chat_label) between 1 and 40);

comment on column public.events.group_chat_enabled is
  'Whether staff track who has been added to this event''s group chat (#1648). Off hides the column, the filter and the toggles; the flags on registrations are kept.';
comment on column public.events.group_chat_label is
  'What the portal calls this event''s group chat (#1648), e.g. "Instagram group chat". Null reads "Group chat".';

alter table public.event_registrations
  add column group_chat_added_at timestamptz,
  add column group_chat_added_by uuid references auth.users (id) on delete set null,
  add constraint event_registrations_group_chat_by_scope
    check (group_chat_added_at is not null or group_chat_added_by is null);

comment on column public.event_registrations.group_chat_added_at is
  'When staff marked this registrant added to the event''s group chat (#1648). Null is not added. Staff only: never shown to the registrant. Kept on cancellation, so staff can see who to remove. Written by set_registrations_group_chat().';
comment on column public.event_registrations.group_chat_added_by is
  'The auth user who marked this registrant added to the group chat (#1648).';

-- event_registrations is read through column grants (20260922040000); a
-- column missing from them disappears from the portal.
grant select (group_chat_added_at, group_chat_added_by)
  on public.event_registrations to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who added them
-- ---------------------------------------------------------------------------

-- uploader_name()'s shape (#1607): their person record in the tenant, else the
-- name on their account. One call per list, for the event's whole table, and
-- not a computed column: a function over the row type needs SELECT on every
-- column, which the minor contacts' carve-out (20260922040000) withholds.
create function public.event_group_chat_adders(p_event_id uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (r.group_chat_added_by)
         r.group_chat_added_by,
         coalesce(
           (select coalesce(p.preferred_name, p.name)
              from public.people p
             where p.auth_user_id = r.group_chat_added_by
               and p.tenant_id = r.tenant_id
             limit 1),
           (select coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
              from auth.users u
             where u.id = r.group_chat_added_by)
         )
    from public.event_registrations r
   where r.event_id = p_event_id
     and r.tenant_id = (select public.current_tenant_id())
     and r.group_chat_added_by is not null
     and public.has_permission('events', 'view')
   order by r.group_chat_added_by;
$$;

comment on function public.event_group_chat_adders(uuid) is
  'The display name of each staff member who marked a registrant of this event added to its group chat (#1648): their person record in the tenant, else the name on their account. Answers an events: view holder, for an event of their own tenant, only.';

revoke execute on function public.event_group_chat_adders(uuid) from public, anon;
grant execute on function public.event_group_chat_adders(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Marking one or many
-- ---------------------------------------------------------------------------

create function public.set_registrations_group_chat(
  p_event_id uuid,
  p_registration_ids uuid[],
  p_added boolean
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_enabled boolean;
  v_changed integer;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to update registrations';
  end if;

  if p_added is null then
    raise exception 'GROUP_CHAT_VALUE_REQUIRED';
  end if;

  select e.group_chat_enabled
    into v_enabled
    from public.events e
   where e.id = p_event_id
     and e.tenant_id = v_tenant_id;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not v_enabled then
    raise exception 'GROUP_CHAT_DISABLED';
  end if;

  if coalesce(cardinality(p_registration_ids), 0) = 0 then
    return 0;
  end if;

  -- All or nothing: one id from another event, or another tenant, refuses
  -- the whole call rather than marking the rest.
  if exists (
    select 1
      from unnest(p_registration_ids) as ids(id)
     where not exists (
       select 1 from public.event_registrations r
        where r.id = ids.id
          and r.event_id = p_event_id
          and r.tenant_id = v_tenant_id
     )
  ) then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  -- Rows already in the state asked for are left alone, so marking a
  -- selection that includes somebody added last week keeps last week's date
  -- and name.
  update public.event_registrations r
     set group_chat_added_at = case when p_added then now() end,
         group_chat_added_by = case when p_added then auth.uid() end
   where r.id = any(p_registration_ids)
     and r.event_id = p_event_id
     and r.tenant_id = v_tenant_id
     and (r.group_chat_added_at is null) = p_added;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

comment on function public.set_registrations_group_chat(uuid, uuid[], boolean) is
  'Marks registrations of one event added to (p_added) or not in its group chat (#1648), and returns how many changed. Requires events: manage and the event''s group chat switched on (GROUP_CHAT_DISABLED). Refuses the whole call if any id is not a registration of that event in the caller''s tenant (REGISTRANT_NOT_FOUND). Cancelled registrations may be marked too, so staff can record taking someone out.';

revoke execute on function public.set_registrations_group_chat(uuid, uuid[], boolean) from public, anon;
grant execute on function public.set_registrations_group_chat(uuid, uuid[], boolean) to authenticated;
