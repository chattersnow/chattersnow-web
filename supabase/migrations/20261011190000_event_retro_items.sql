-- #1578 (part 3 of #1575): a structured event retro.
--
-- The Report card's single `lessons_learned` textarea was one author's essay,
-- and nothing in it reached the next event. It becomes a list of items, each
-- written by whoever on the team had something to say:
--
--   went_well  what to keep doing
--   improve    what to change
--   action     a concrete follow-up, with an optional owner and open/done
--
-- An item may name the area of the computed report it is about (money, goods,
-- sponsors, team, guests, operations -- the Report card's sections, #1576), so
-- it can sit beside the numbers it explains.
--
-- Who writes: anyone on the event's staff roster (event_staff, matched to the
-- signed-in account through people.auth_user_id), plus events:manage holders.
-- Volunteers are on event_volunteers, not the roster, so they cannot. An author
-- edits and deletes their own items; events:manage edits and deletes any.
--
-- Carry-forward: an open action item stays open until someone marks it done,
-- and the portal shows it on every later event that shares a program with its
-- own (event_programs -- there is no single events.program_id since #45). The
-- query is the portal's; RLS here only has to let events:view read the items.
--
-- lessons_learned is archived as one `improve` item per event, and the column
-- is kept rather than dropped: seed_demo_tenant (20260908080000) still writes
-- it, so a trigger turns anything still written there into an item too. No
-- portal code reads or writes the column after this.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table public.event_retro_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  kind text not null
    constraint event_retro_items_kind_check
      check (kind in ('went_well', 'improve', 'action')),
  body text not null
    constraint event_retro_items_body_check
      check (char_length(btrim(body)) between 1 and 2000),
  area text
    constraint event_retro_items_area_check
      check (area in ('money', 'goods', 'sponsors', 'team', 'guests', 'operations')),
  -- Null only on items archived from lessons_learned, which had no author.
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  owner_person_id uuid,
  status text
    constraint event_retro_items_status_check
      check (status in ('open', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stamped by set_updated_at(), so an action closed by someone other than its
  -- author says who.
  updated_by uuid references auth.users(id) on delete set null,
  -- Owner and status belong to action items alone, and every action item has
  -- a status.
  constraint event_retro_items_action_fields check (
    case when kind = 'action'
      then status is not null
      else status is null and owner_person_id is null
    end
  ),
  constraint event_retro_items_completed_when_done check (
    (status = 'done') = (completed_at is not null)
  ),
  constraint event_retro_items_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade,
  constraint event_retro_items_owner_in_tenant
    foreign key (tenant_id, owner_person_id)
    references public.people (tenant_id, id) on delete set null (owner_person_id)
);

create index event_retro_items_event_idx
  on public.event_retro_items (tenant_id, event_id, created_at);

-- The carry-forward lookup: open action items across a program's events.
create index event_retro_items_open_actions_idx
  on public.event_retro_items (tenant_id, event_id)
  where kind = 'action' and status = 'open';

create index event_retro_items_owner_idx
  on public.event_retro_items (owner_person_id)
  where owner_person_id is not null;

create trigger set_updated_at before update on public.event_retro_items
  for each row execute function public.set_updated_at();

comment on table public.event_retro_items is
  'An event''s retro (#1578): went-well, improve and action items, each by its own author. Action items carry an optional owner and open/done status; open ones show on later events in the same program. Written by event_staff roster members and events:manage holders (can_write_event_retro).';

-- ---------------------------------------------------------------------------
-- 2. Who may write
-- ---------------------------------------------------------------------------

-- Whether the signed-in account is on this event's staff roster. A person is
-- linked to their account lazily (resolve_current_person_id), so an unlinked
-- person with the account's email counts too -- the same match that function
-- would make. Security definer because events:view does not imply people:view.
create function public.is_on_event_staff(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.event_staff s
      join public.people p on p.id = s.person_id and p.tenant_id = s.tenant_id
     where s.event_id = p_event_id
       and s.tenant_id = (select public.current_tenant_id())
       and (
         p.auth_user_id = auth.uid()
         or (
           p.auth_user_id is null
           and lower(p.email) = (select lower(u.email) from auth.users u where u.id = auth.uid())
         )
       )
  );
$$;

comment on function public.is_on_event_staff(uuid) is
  'Whether the signed-in account is on the event''s staff roster (event_staff), in the caller''s tenant (#1578).';

revoke all on function public.is_on_event_staff(uuid) from public, anon;
grant execute on function public.is_on_event_staff(uuid) to authenticated;

create function public.can_write_event_retro(p_event_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.has_permission('events', 'manage')
      or (public.has_permission('events', 'view') and public.is_on_event_staff(p_event_id));
$$;

comment on function public.can_write_event_retro(uuid) is
  'Whether the caller may add retro items to the event (#1578): events:manage, or events:view and on the event''s staff roster.';

revoke all on function public.can_write_event_retro(uuid) from public, anon;
grant execute on function public.can_write_event_retro(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.event_retro_items enable row level security;

-- The revoke first, because a hosted project's default privileges hand every
-- new table to both roles (20260911010000, section 4). Update is granted by
-- column, so neither the author, the event nor the tenant can be rewritten.
revoke all on public.event_retro_items from public, anon, authenticated;
grant select, insert, delete on public.event_retro_items to authenticated;
grant update (kind, body, area, owner_person_id, status, completed_at)
  on public.event_retro_items to authenticated;

create policy "event_retro_items select" on public.event_retro_items
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

create policy "event_retro_items insert" on public.event_retro_items
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and author_id = (select auth.uid())
    and public.can_write_event_retro(event_id)
  );

create policy "event_retro_items update" on public.event_retro_items
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      public.has_permission('events', 'manage')
      or (author_id = (select auth.uid()) and public.can_write_event_retro(event_id))
    )
  )
  with check (
    tenant_id = (select public.current_tenant_id())
  );

create policy "event_retro_items delete" on public.event_retro_items
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      public.has_permission('events', 'manage')
      or (author_id = (select auth.uid()) and public.can_write_event_retro(event_id))
    )
  );

-- Audited like event_checklist_items, the other per-event list.
insert into public.audited_tables (table_name) values ('event_retro_items');

create trigger audit_log_row after insert or update or delete
  on public.event_retro_items
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 4. Author name, for display
-- ---------------------------------------------------------------------------

-- A computed column (`author_name` in a PostgREST select). Definer, since the
-- author's directory row may sit behind people:view the reader lacks; it
-- returns a name and nothing else.
create function public.author_name(public.event_retro_items)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(p.preferred_name, p.name)
       from public.people p
      where p.auth_user_id = $1.author_id
        and p.tenant_id = $1.tenant_id
      limit 1),
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
       from auth.users u
      where u.id = $1.author_id)
  )
  where $1.tenant_id = (select public.current_tenant_id());
$$;

revoke all on function public.author_name(public.event_retro_items) from public, anon;
grant execute on function public.author_name(public.event_retro_items) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Archive lessons_learned
-- ---------------------------------------------------------------------------

insert into public.event_retro_items (tenant_id, event_id, kind, body, author_id, created_at)
select e.tenant_id, e.id, 'improve', left(btrim(e.lessons_learned), 2000), null,
       coalesce(e.report_submitted_at, e.updated_at, e.created_at)
  from public.events e
 where nullif(btrim(e.lessons_learned), '') is not null;

-- Anything still written to the column -- only seed_demo_tenant does -- lands
-- as an item too, so the demo's retro is not empty after its nightly reset.
create function public.archive_event_lessons_learned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(new.lessons_learned), '') is not null
     and (tg_op = 'INSERT' or new.lessons_learned is distinct from old.lessons_learned) then
    insert into public.event_retro_items (tenant_id, event_id, kind, body, author_id)
    values (new.tenant_id, new.id, 'improve', left(btrim(new.lessons_learned), 2000), null);
  end if;
  return null;
end;
$$;

revoke all on function public.archive_event_lessons_learned() from public, anon, authenticated;

create trigger archive_event_lessons_learned
  after insert or update of lessons_learned on public.events
  for each row execute function public.archive_event_lessons_learned();

comment on column public.events.lessons_learned is
  'Retired by #1578: archived into event_retro_items as an `improve` item, and anything still written here becomes one. The portal neither reads nor writes it.';
