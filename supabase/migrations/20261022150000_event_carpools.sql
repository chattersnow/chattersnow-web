-- #1649: carpool cars on an event -- drivers, passengers, seats, and whether
-- each passenger has paid their driver.
--
-- Registration questions already tell staff who can drive and how many seats
-- they have (#1501). The plan itself -- which car, who drives, who rides with
-- whom, and who has paid their share -- lived in a spreadsheet or a chat. This
-- brings it into the event.
--
-- THE SWITCH. `events.carpools_enabled`, off by default. Off, nothing about
-- carpools shows anywhere; turning it off keeps the cars, so turning it back on
-- loses nothing. `events.carpool_seats_question_id` optionally names a
-- `number` question whose answer prefills a new car's seats.
--
-- That column has NO foreign key on purpose. A second relationship between
-- events and event_registration_questions would make every bare
-- `event_registration_questions(...)` embed of an event ambiguous (PGRST201),
-- and the event detail page on `main` -- which shares this database -- embeds
-- exactly that. The triggers in section 2 stand in for it: the question must
-- be a live `number` question of the same event, and archiving, retyping or
-- deleting it clears the pointer.
--
-- CARS AND PASSENGERS. A car has a label, an optional driver (an active
-- registration of the event), seats for passengers (1 to 12), and optional
-- staff-only "leaving from" and notes. A passenger row puts a registration in a
-- car; a registration takes seats equal to its party size, since a party
-- travels together (#1501), and a car over its seats is allowed -- staff may
-- know better -- and only warned about in the portal. A registration is in at
-- most one car per event, as its driver or as a passenger: a unique index on
-- each side, plus triggers so it cannot be both.
--
-- PAYMENT. `paid_driver_at` and `paid_marked_by` on the passenger row. No
-- amount: riders work out the split with their driver (#1646).
--
-- Read at `events: view` under RLS. No write grants: every write goes through
-- the `events: manage` functions in section 4, each of which refuses an event
-- with the switch off, and a registration of another event or tenant or one
-- that is cancelled.
--
-- Cars are audited like the event's other configuration (create, delete,
-- driver changes). Passenger moves and paid ticks are operational, like an
-- answer: the row records who and when.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.events
  add column carpools_enabled boolean not null default false,
  add column carpool_seats_question_id uuid;

comment on column public.events.carpools_enabled is
  'Whether staff organize carpools for this event (#1649). Off hides the Carpools section and column; the cars are kept.';
comment on column public.events.carpool_seats_question_id is
  'The number question whose answer prefills a new car''s seats (#1649). Deliberately not a foreign key (a second events/questions relationship would make bare embeds ambiguous): events_carpool_seats_question_check() validates it, and archiving, retyping or deleting the question clears it.';

create table public.event_carpool_cars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  label text not null
    constraint event_carpool_cars_label_check
      check (btrim(label) <> '' and char_length(label) <= 60),
  driver_registration_id uuid,
  -- When the current driver was set, so the board can say a driver's answers
  -- changed after they were put in charge of the car (#1591). Not tied to the
  -- driver by a check: deleting the registration outright nulls only the
  -- driver column, and a stale time beside no driver means nothing.
  driver_assigned_at timestamptz,
  seats integer not null
    constraint event_carpool_cars_seats_check check (seats between 1 and 12),
  leaving_from text
    constraint event_carpool_cars_leaving_from_check
      check (leaving_from is null or (btrim(leaving_from) <> '' and char_length(leaving_from) <= 500)),
  notes text
    constraint event_carpool_cars_notes_check
      check (notes is null or (btrim(notes) <> '' and char_length(notes) <= 500)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_carpool_cars_tenant_id_id_key unique (tenant_id, id),
  constraint event_carpool_cars_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade,
  -- Only the driver column goes null if the registration is deleted outright;
  -- the car and its tenant stay.
  constraint event_carpool_cars_driver_fkey
    foreign key (tenant_id, driver_registration_id)
    references public.event_registrations (tenant_id, id)
    on delete set null (driver_registration_id)
);

comment on table public.event_carpool_cars is
  'A car in an event''s carpool plan (#1649): label, driver (an active registration of the event, or none), seats for passengers, and staff-only leaving-from and notes. Read at events: view; written only by save_event_carpool_car() and delete_event_carpool_car().';

create index event_carpool_cars_event_idx on public.event_carpool_cars (event_id, sort_order);
-- A registration drives at most one car.
create unique index event_carpool_cars_driver_key
  on public.event_carpool_cars (driver_registration_id)
  where driver_registration_id is not null;

create table public.event_carpool_passengers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  car_id uuid not null,
  registration_id uuid not null,
  paid_driver_at timestamptz,
  -- auth.users, like every other `*_by` column (see 20261022130000).
  paid_marked_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  constraint event_carpool_passengers_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade,
  -- Deleting a car sends its passengers back to Unassigned.
  constraint event_carpool_passengers_car_fkey
    foreign key (tenant_id, car_id)
    references public.event_carpool_cars (tenant_id, id) on delete cascade,
  constraint event_carpool_passengers_registration_fkey
    foreign key (tenant_id, registration_id)
    references public.event_registrations (tenant_id, id) on delete cascade,
  constraint event_carpool_passengers_paid_by_scope
    check (paid_driver_at is not null or paid_marked_by is null)
);

comment on table public.event_carpool_passengers is
  'A registration riding in a carpool car (#1649), and whether it has paid its driver (when, and which auth user marked it; no amount). At most one car per registration per event. Read at events: view; written only by the carpool functions.';

-- At most one car per registration per event.
create unique index event_carpool_passengers_registration_key
  on public.event_carpool_passengers (event_id, registration_id);
create index event_carpool_passengers_car_idx on public.event_carpool_passengers (car_id);
create index event_carpool_passengers_registration_idx on public.event_carpool_passengers (registration_id);

-- The revoke comes first because a hosted project's default privileges hand
-- every new table to both roles (20260911010000, section 4).
alter table public.event_carpool_cars enable row level security;
alter table public.event_carpool_passengers enable row level security;

revoke all on public.event_carpool_cars, public.event_carpool_passengers
  from public, anon, authenticated;
grant select on public.event_carpool_cars, public.event_carpool_passengers
  to authenticated;

create policy "event_carpool_cars select" on public.event_carpool_cars
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

create policy "event_carpool_passengers select" on public.event_carpool_passengers
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

-- Cars are configuration, audited like the event's questions: create, delete
-- and driver changes. Passengers are not -- the row says who and when.
insert into public.audited_tables (table_name, pk_column) values
  ('event_carpool_cars', 'id');

create trigger audit_log_row after insert or update or delete
  on public.event_carpool_cars
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 2. The seats question, in place of a foreign key
-- ---------------------------------------------------------------------------

create function public.events_carpool_seats_question_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.carpool_seats_question_id is not null and not exists (
    select 1
      from public.event_registration_questions q
     where q.id = new.carpool_seats_question_id
       and q.event_id = new.id
       and q.tenant_id = new.tenant_id
       and q.kind = 'number'
       and q.archived_at is null
  ) then
    raise exception 'CARPOOL_SEATS_QUESTION_INVALID';
  end if;
  return new;
end;
$$;

create trigger events_carpool_seats_question_check
  before insert or update of carpool_seats_question_id on public.events
  for each row execute function public.events_carpool_seats_question_check();

-- Archiving, retyping or deleting the question clears the pointer, so the
-- check above never strands an event's other edits.
create function public.event_registration_questions_clear_carpool_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
     or new.archived_at is not null
     or new.kind <> 'number' then
    update public.events
       set carpool_seats_question_id = null
     where carpool_seats_question_id = old.id
       and tenant_id = old.tenant_id;
  end if;
  return null;
end;
$$;

create trigger event_registration_questions_clear_carpool_seats
  after update of archived_at, kind or delete on public.event_registration_questions
  for each row execute function public.event_registration_questions_clear_carpool_seats();

-- ---------------------------------------------------------------------------
-- 3. A registration is a driver or a passenger, never both
-- ---------------------------------------------------------------------------

create function public.event_carpool_not_driver_and_passenger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'event_carpool_passengers' then
    if exists (
      select 1 from public.event_carpool_cars c
       where c.driver_registration_id = new.registration_id
    ) then
      raise exception 'CARPOOL_ALREADY_ASSIGNED';
    end if;
  elsif new.driver_registration_id is not null and exists (
    select 1 from public.event_carpool_passengers p
     where p.registration_id = new.driver_registration_id
  ) then
    raise exception 'CARPOOL_ALREADY_ASSIGNED';
  end if;
  return new;
end;
$$;

create trigger event_carpool_passengers_not_driver
  before insert or update of registration_id on public.event_carpool_passengers
  for each row execute function public.event_carpool_not_driver_and_passenger();

create trigger event_carpool_cars_driver_not_passenger
  before insert or update of driver_registration_id on public.event_carpool_cars
  for each row execute function public.event_carpool_not_driver_and_passenger();

-- ---------------------------------------------------------------------------
-- 4. Writes
-- ---------------------------------------------------------------------------

-- The checks every write shares: `events: manage`, the event in the caller's
-- tenant, and its switch on. Returns the tenant.
create function public.carpool_event_guard(p_event_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_enabled boolean;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to organize carpools';
  end if;

  select e.carpools_enabled
    into v_enabled
    from public.events e
   where e.id = p_event_id
     and e.tenant_id = v_tenant_id;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if not v_enabled then
    raise exception 'CARPOOLS_DISABLED';
  end if;
  return v_tenant_id;
end;
$$;

revoke execute on function public.carpool_event_guard(uuid) from public, anon, authenticated;

-- An active registration of this event, in this tenant.
create function public.carpool_registration_guard(
  p_tenant_id uuid,
  p_event_id uuid,
  p_registration_id uuid
) returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cancelled_at timestamptz;
begin
  select r.cancelled_at
    into v_cancelled_at
    from public.event_registrations r
   where r.id = p_registration_id
     and r.event_id = p_event_id
     and r.tenant_id = p_tenant_id;

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;
  if v_cancelled_at is not null then
    raise exception 'REGISTRANT_CANCELLED';
  end if;
end;
$$;

revoke execute on function public.carpool_registration_guard(uuid, uuid, uuid) from public, anon, authenticated;

-- The car's event, refusing a car of another tenant as not found.
create function public.carpool_car_event(p_car_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.event_id
    from public.event_carpool_cars c
   where c.id = p_car_id
     and c.tenant_id = (select public.current_tenant_id());
$$;

revoke execute on function public.carpool_car_event(uuid) from public, anon, authenticated;

create function public.save_event_carpool_car(
  p_event_id uuid,
  p_car_id uuid,
  p_label text,
  p_driver_registration_id uuid,
  p_seats integer,
  p_leaving_from text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.carpool_event_guard(p_event_id);
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_leaving_from text := nullif(btrim(coalesce(p_leaving_from, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_current_driver uuid;
  v_id uuid;
begin
  if p_seats is null or p_seats < 1 or p_seats > 12 then
    raise exception 'CARPOOL_SEATS_INVALID';
  end if;
  if char_length(v_label) > 60 then
    raise exception 'CARPOOL_LABEL_TOO_LONG';
  end if;
  if char_length(v_leaving_from) > 500 or char_length(v_notes) > 500 then
    raise exception 'CARPOOL_TEXT_TOO_LONG';
  end if;

  if p_car_id is not null then
    select c.driver_registration_id
      into v_current_driver
      from public.event_carpool_cars c
     where c.id = p_car_id
       and c.event_id = p_event_id
       and c.tenant_id = v_tenant_id
       for update;
    if not found then
      raise exception 'CAR_NOT_FOUND';
    end if;
  end if;

  if p_driver_registration_id is not null
     and p_driver_registration_id is distinct from v_current_driver then
    perform public.carpool_registration_guard(v_tenant_id, p_event_id, p_driver_registration_id);
    if exists (
      select 1 from public.event_carpool_cars c
       where c.driver_registration_id = p_driver_registration_id
    ) or exists (
      select 1 from public.event_carpool_passengers p
       where p.registration_id = p_driver_registration_id
    ) then
      raise exception 'CARPOOL_ALREADY_ASSIGNED';
    end if;
  end if;

  if p_car_id is null then
    insert into public.event_carpool_cars (
      tenant_id, event_id, label, driver_registration_id, driver_assigned_at,
      seats, leaving_from, notes, sort_order
    )
    select v_tenant_id,
           p_event_id,
           -- "Car 1", "Car 2", ...: one past the highest so far.
           coalesce(v_label, 'Car ' || (count(*) + 1)),
           p_driver_registration_id,
           case when p_driver_registration_id is not null then now() end,
           p_seats,
           v_leaving_from,
           v_notes,
           coalesce(max(c.sort_order) + 1, 0)
      from public.event_carpool_cars c
     where c.event_id = p_event_id
       and c.tenant_id = v_tenant_id
    returning id into v_id;
    return v_id;
  end if;

  update public.event_carpool_cars c
     set label = coalesce(v_label, c.label),
         driver_registration_id = p_driver_registration_id,
         driver_assigned_at = case
           when p_driver_registration_id is null then null
           when p_driver_registration_id is distinct from v_current_driver then now()
           else c.driver_assigned_at
         end,
         seats = p_seats,
         leaving_from = v_leaving_from,
         notes = v_notes,
         updated_at = now()
   where c.id = p_car_id;
  return p_car_id;
end;
$$;

comment on function public.save_event_carpool_car(uuid, uuid, text, uuid, integer, text, text) is
  'Adds (p_car_id null) or updates a carpool car of an event (#1649) and returns its id. A blank label reads "Car N". Requires events: manage and the event''s carpools switched on (CARPOOLS_DISABLED). Refuses a driver who is not an active registration of the event (REGISTRANT_NOT_FOUND, REGISTRANT_CANCELLED) or who is already in a car (CARPOOL_ALREADY_ASSIGNED), seats outside 1-12 (CARPOOL_SEATS_INVALID), and text over its length (CARPOOL_LABEL_TOO_LONG, CARPOOL_TEXT_TOO_LONG).';

revoke execute on function public.save_event_carpool_car(uuid, uuid, text, uuid, integer, text, text) from public, anon;
grant execute on function public.save_event_carpool_car(uuid, uuid, text, uuid, integer, text, text) to authenticated;

create function public.delete_event_carpool_car(p_car_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := public.carpool_car_event(p_car_id);
begin
  if v_event_id is null then
    -- The guard's permission check first, so a reader without manage is told
    -- that rather than "not found".
    if not public.has_permission('events', 'manage') then
      raise exception 'Not authorized to organize carpools';
    end if;
    raise exception 'CAR_NOT_FOUND';
  end if;
  perform public.carpool_event_guard(v_event_id);

  -- Its passengers go back to Unassigned through the cascade.
  delete from public.event_carpool_cars where id = p_car_id;
end;
$$;

comment on function public.delete_event_carpool_car(uuid) is
  'Deletes a carpool car (#1649); its passengers go back to Unassigned. Requires events: manage and the event''s carpools switched on.';

revoke execute on function public.delete_event_carpool_car(uuid) from public, anon;
grant execute on function public.delete_event_carpool_car(uuid) to authenticated;

create function public.set_event_carpool_passengers(
  p_car_id uuid,
  p_registration_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := public.carpool_car_event(p_car_id);
  v_tenant_id uuid;
  v_id uuid;
  v_ids uuid[] := array(select distinct unnest(coalesce(p_registration_ids, '{}')));
begin
  if v_event_id is null then
    if not public.has_permission('events', 'manage') then
      raise exception 'Not authorized to organize carpools';
    end if;
    raise exception 'CAR_NOT_FOUND';
  end if;
  v_tenant_id := public.carpool_event_guard(v_event_id);

  -- All or nothing: one id that is not an active registration of this event,
  -- or that is already in another car, refuses the whole call.
  foreach v_id in array v_ids loop
    if not exists (
      select 1 from public.event_carpool_passengers p
       where p.registration_id = v_id and p.car_id = p_car_id
    ) then
      perform public.carpool_registration_guard(v_tenant_id, v_event_id, v_id);
      if exists (
        select 1 from public.event_carpool_passengers p
         where p.registration_id = v_id and p.event_id = v_event_id
      ) or exists (
        select 1 from public.event_carpool_cars c
         where c.driver_registration_id = v_id
      ) then
        raise exception 'CARPOOL_ALREADY_ASSIGNED';
      end if;
    end if;
  end loop;

  -- Rows that stay keep their paid tick and when they were added.
  delete from public.event_carpool_passengers p
   where p.car_id = p_car_id
     and not (p.registration_id = any(v_ids));

  insert into public.event_carpool_passengers (tenant_id, event_id, car_id, registration_id)
  select v_tenant_id, v_event_id, p_car_id, ids.id
    from unnest(v_ids) as ids(id)
   where not exists (
     select 1 from public.event_carpool_passengers p
      where p.registration_id = ids.id and p.car_id = p_car_id
   );

  return cardinality(v_ids);
end;
$$;

comment on function public.set_event_carpool_passengers(uuid, uuid[]) is
  'Makes p_registration_ids the passengers of one carpool car (#1649) and returns how many it holds. Passengers who stay keep their paid tick. Requires events: manage and the switch on; refuses the whole call if any id is not an active registration of the car''s event (REGISTRANT_NOT_FOUND, REGISTRANT_CANCELLED) or is already in another car or driving (CARPOOL_ALREADY_ASSIGNED).';

revoke execute on function public.set_event_carpool_passengers(uuid, uuid[]) from public, anon;
grant execute on function public.set_event_carpool_passengers(uuid, uuid[]) to authenticated;

create function public.move_carpool_passenger(
  p_event_id uuid,
  p_registration_id uuid,
  p_to_car_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.carpool_event_guard(p_event_id);
  v_from_car uuid;
begin
  select p.car_id
    into v_from_car
    from public.event_carpool_passengers p
   where p.event_id = p_event_id
     and p.registration_id = p_registration_id
     and p.tenant_id = v_tenant_id;

  -- Null is Unassigned.
  if p_to_car_id is null then
    delete from public.event_carpool_passengers p
     where p.event_id = p_event_id
       and p.registration_id = p_registration_id
       and p.tenant_id = v_tenant_id;
    return;
  end if;

  if public.carpool_car_event(p_to_car_id) is distinct from p_event_id then
    raise exception 'CAR_NOT_FOUND';
  end if;
  if v_from_car = p_to_car_id then
    return;
  end if;

  perform public.carpool_registration_guard(v_tenant_id, p_event_id, p_registration_id);
  if exists (
    select 1 from public.event_carpool_cars c
     where c.driver_registration_id = p_registration_id
  ) then
    raise exception 'CARPOOL_ALREADY_ASSIGNED';
  end if;

  if v_from_car is null then
    insert into public.event_carpool_passengers (tenant_id, event_id, car_id, registration_id)
    values (v_tenant_id, p_event_id, p_to_car_id, p_registration_id);
  else
    -- A new car is a new driver: what was paid to the last one does not carry.
    update public.event_carpool_passengers p
       set car_id = p_to_car_id,
           added_at = now(),
           paid_driver_at = null,
           paid_marked_by = null
     where p.event_id = p_event_id
       and p.registration_id = p_registration_id;
  end if;
end;
$$;

comment on function public.move_carpool_passenger(uuid, uuid, uuid) is
  'Puts a registration in a carpool car of the same event, moves it from one car to another (clearing its paid tick), or with p_to_car_id null takes it out (#1649). Requires events: manage and the switch on; refuses a registration that is not active on the event, a car of another event (CAR_NOT_FOUND), and a driver (CARPOOL_ALREADY_ASSIGNED).';

revoke execute on function public.move_carpool_passenger(uuid, uuid, uuid) from public, anon;
grant execute on function public.move_carpool_passenger(uuid, uuid, uuid) to authenticated;

create function public.set_carpool_passenger_paid(
  p_car_id uuid,
  p_registration_id uuid,
  p_paid boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := public.carpool_car_event(p_car_id);
begin
  if v_event_id is null then
    if not public.has_permission('events', 'manage') then
      raise exception 'Not authorized to organize carpools';
    end if;
    raise exception 'CAR_NOT_FOUND';
  end if;
  perform public.carpool_event_guard(v_event_id);

  if p_paid is null then
    raise exception 'CARPOOL_PAID_REQUIRED';
  end if;

  -- Ticking a row already ticked keeps its date and name.
  update public.event_carpool_passengers p
     set paid_driver_at = case when p_paid then coalesce(p.paid_driver_at, now()) end,
         paid_marked_by = case when p_paid then coalesce(p.paid_marked_by, auth.uid()) end
   where p.car_id = p_car_id
     and p.registration_id = p_registration_id;

  if not found then
    raise exception 'PASSENGER_NOT_FOUND';
  end if;
end;
$$;

comment on function public.set_carpool_passenger_paid(uuid, uuid, boolean) is
  'Marks a carpool passenger paid (or not) to their driver (#1649), recording when and by whom. No amount is stored. Requires events: manage and the switch on; PASSENGER_NOT_FOUND where the registration is not in that car.';

revoke execute on function public.set_carpool_passenger_paid(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_carpool_passenger_paid(uuid, uuid, boolean) to authenticated;

-- Who ticked "Paid driver", by name: event_group_chat_adders()' shape.
create function public.event_carpool_markers(p_event_id uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (p.paid_marked_by)
         p.paid_marked_by,
         coalesce(
           (select coalesce(pe.preferred_name, pe.name)
              from public.people pe
             where pe.auth_user_id = p.paid_marked_by
               and pe.tenant_id = p.tenant_id
             limit 1),
           (select coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
              from auth.users u
             where u.id = p.paid_marked_by)
         )
    from public.event_carpool_passengers p
   where p.event_id = p_event_id
     and p.tenant_id = (select public.current_tenant_id())
     and p.paid_marked_by is not null
     and public.has_permission('events', 'view')
   order by p.paid_marked_by;
$$;

comment on function public.event_carpool_markers(uuid) is
  'The display name of each staff member who marked a carpool passenger of this event paid (#1649). Answers an events: view holder, for an event of their own tenant, only.';

revoke execute on function public.event_carpool_markers(uuid) from public, anon;
grant execute on function public.event_carpool_markers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cancelling a registration takes it out of its car
-- ---------------------------------------------------------------------------

-- On every cancel path (staff, the registrant's own, and any later one), since
-- they all set cancelled_at. A driver's car keeps its passengers and shows "No
-- driver". Undoing the cancel does not put anybody back.
create function public.event_registrations_leave_carpool()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.event_carpool_passengers
   where registration_id = new.id;
  update public.event_carpool_cars
     set driver_registration_id = null,
         driver_assigned_at = null,
         updated_at = now()
   where driver_registration_id = new.id;
  return null;
end;
$$;

create trigger event_registrations_leave_carpool
  after update of cancelled_at on public.event_registrations
  for each row
  when (old.cancelled_at is null and new.cancelled_at is not null)
  execute function public.event_registrations_leave_carpool();

-- ---------------------------------------------------------------------------
-- 6. Retention
-- ---------------------------------------------------------------------------

-- run_retention_purge(): the live body from 20261021180000 with rule C (A.
-- event registrations) taking an anonymized registration out of its carpool
-- -- deleting its passenger row and clearing it as a driver -- and selecting a
-- row still in one; and then clearing the leaving-from and notes of the
-- event's cars, staff text that can name somebody. Cars themselves outlive
-- their people. Re-emitted in full because the function is one plpgsql block;
-- the signature is unchanged, so `create or replace` is enough.
CREATE OR REPLACE FUNCTION public.run_retention_purge(p_dry_run boolean DEFAULT true, p_as_of timestamp with time zone DEFAULT now(), p_trigger text DEFAULT 'cron'::text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid;
  v_run_id uuid;
  v_result_run_id uuid;
  v_ids uuid[];
  v_person_ids uuid[];
  v_failed boolean := false;
  v_period interval;
  v_secondary interval;
  v_mode text;
  v_enforce boolean;
  -- Rule N's three values, computed once above the loop and logged inside it.
  v_account_ids uuid[] := '{}';
  v_account_enforce boolean := false;
  v_account_error text;
begin
  -- A manual dry run from the portal must not interleave with the nightly job.
  -- Transaction-scoped, so it releases on commit or rollback either way.
  if not pg_try_advisory_xact_lock(hashtext('retention_purge')) then
    return null;
  end if;

  -- Rule H, once for the sweep rather than once per tenant. rate_limit_hits is
  -- keyed by IP and route and has no tenant_id, so there is nothing to scope --
  -- but its policy row is per-tenant now, and purge_rate_limit_hits() takes the
  -- strictest clock any tenant has set. Each tenant's run still logs the rule,
  -- inside the loop, so the Data Retention page explains it as before.
  if not p_dry_run then
    perform public.purge_rate_limit_hits(p_as_of);
  end if;

  -- N, part one (#1296). Website accounts, decided and applied once for the
  -- whole platform rather than once per tenant.
  --
  -- The second rule with nothing to scope, for a stronger reason than rule H's:
  -- an account has no tenant until a claim is approved. Somebody signs up at
  -- /my against whichever host they were on and nothing records which --
  -- deliberately, because #1161 resolves a constituent's tenant from the
  -- request rather than from a membership. There is no tenant whose sweep owns
  -- the row.
  --
  -- Two consequences, both the conservative direction:
  --
  --   * the clock is the SHORTEST any tenant has set, as rule H's is. An
  --     account belongs to a person rather than to an organization, so no
  --     tenant's choice may extend how long another's sign-up is held.
  --   * it enforces only where EVERY active tenant has the rule enforcing. One
  --     organization that has not agreed to the period is a veto, because the
  --     row it would remove is as much the next organization's as its own. A
  --     tenant with no row at all reads as 'off' and vetoes too.
  --
  -- The candidate list is read whatever the modes say, so a dry run reports
  -- real counts. It is read here rather than after the loop, so rules L and M
  -- below have not yet dropped this run's expired claims: an account those
  -- deletions free is deleted by the next night's run, not this one. The same
  -- conservatism rule D2 records, and for the same reason -- reporting the
  -- accounts that are already free is checkable, and simulating the ones a
  -- later rule in the same run would free is not.
  --
  -- In its own exception block, unlike rule H's call, which is bare: this one
  -- deletes from auth.users, where a reference the walk cannot see (an
  -- extension's table, storage.objects.owner) raises 23503. The sweep has to
  -- survive that and report it, which is what v_account_error carries into
  -- every tenant's run below.
  begin
    select min(period) into v_period
      from public.retention_policies where policy_key = 'constituent_accounts';

    if v_period is not null then
      v_account_ids := public.retention_unclaimed_account_ids(p_as_of - v_period);

      v_account_enforce := not p_dry_run and not exists (
        select 1
          from public.tenants t
          left join public.retention_policies p
            on p.tenant_id = t.id and p.policy_key = 'constituent_accounts'
         where t.status = 'active'
           and coalesce(p.mode, 'off') <> 'enforce'
      );

      if v_account_enforce and array_length(v_account_ids, 1) is not null then
        delete from auth.users where id = any(v_account_ids);
      end if;
    end if;
  exception when others then
    v_account_error := sqlerrm;
    v_account_ids := '{}';
  end;

  for v_tenant in
    select t.id
      from public.tenants t
     where t.status = 'active'
       and (p_tenant_id is null or t.id = p_tenant_id)
     order by t.created_at
  loop
    v_failed := false;

    insert into public.retention_runs (tenant_id, as_of, dry_run, trigger, triggered_by, status)
    values (v_tenant, p_as_of, p_dry_run, p_trigger, auth.uid(), 'running')
    returning id into v_run_id;

    if v_tenant = p_tenant_id then
      v_result_run_id := v_run_id;
    end if;

    -- Each rule gets its own exception block. A plpgsql exception block is a
    -- subtransaction, so a rule that fails rolls back only itself and the run
    -- finishes as 'partial' with the error recorded against that rule -- rather
    -- than one bad clock discarding the work of the other eight.

    -- H. Abuse-protection records. Not mode-gated; see purge_rate_limit_hits.
    --
    -- The only rule with no tenant dimension: rate_limit_hits is keyed by IP and
    -- route, has no tenant_id, and is correctly global (20260906010000 lists it
    -- among the twelve tables that stay platform-wide). The sweep therefore runs
    -- the purge once, above the loop, and each tenant's run logs the rule so the
    -- page still explains it rather than appearing to have skipped it.
    begin
      perform public.retention_log(v_run_id, 'rate_limit_hits', 'rate_limit_hits',
        case when p_dry_run then 'skipped' else 'deleted' end, '{}');
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rate_limit_hits', 'rate_limit_hits', 'skipped', sqlerrm);
    end;

    -- A. Contact form messages. The one table here that is safe to delete
    -- outright: nothing has a foreign key to it and it carries no audit trigger.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'contact_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'skipped', '{}');
      else
        v_ids := array(
          select id from public.contact_messages
           where tenant_id = v_tenant and created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.contact_messages where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'contact_messages', 'contact_messages', 'skipped', sqlerrm);
    end;

    -- C. Event registrations: strip the person, keep the row.
    --
    -- name and email are NOT NULL (20260823090000), so they take sentinels rather
    -- than nulls. '' is the established "no email" value -- both unique indexes
    -- here are partial (WHERE email <> '', WHERE person_id IS NOT NULL, see
    -- 20260901010000), which is exactly what makes anonymizing many rows of one
    -- event safe. party_size, checked_in_at, the three *_at_event snapshot
    -- columns, the waiver pair and party_includes_minor survive untouched: they
    -- are the impact figures and the acts this rule exists to preserve.
    --
    -- The four accompanying-adult and emergency contacts go with the personal
    -- fields (#685). One of them is the only personal data this product holds
    -- about somebody who never visited the site, and holding an emergency
    -- contact's number three years after the event is over describes nothing.
    -- They join the selector as well as the update: a row whose only remaining
    -- personal data was an emergency contact would otherwise never be picked up
    -- again. The column constraint is one-directional for exactly this update --
    -- the flag stays true while the contacts go null, which it allows.
    --
    -- The three photo-consent columns go with them (#599), and that is the
    -- OPPOSITE call from the waiver pair two paragraphs up. Both are records of
    -- something somebody said, so the difference is what they are about. An
    -- acceptance is a fact about an ACT -- this person agreed to these terms on
    -- this date -- and it stands on its own; #686 kept it for that reason. Photo
    -- consent is a fact about a person's FACE, and it is worthless the moment
    -- the row cannot be tied to one: an anonymized "declined" protects nobody,
    -- because there is no name to match against a photograph, and an anonymized
    -- "granted" authorizes nothing. So all three go beside the name, the email
    -- and the person_id, and `photo_consent is not null` joins the selector for
    -- the same reason the contacts do.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'event_registrations' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.events e on e.id = r.event_id
           where r.tenant_id = v_tenant
             and coalesce(e.ends_at, e.starts_at) < p_as_of - v_period
             and (r.name <> 'Removed' or r.person_id is not null
                  or r.phone is not null or r.notes is not null
                  or r.instagram_handle is not null or r.pronouns is not null
                  or r.accompanying_adult_name is not null
                  or r.accompanying_adult_phone is not null
                  or r.emergency_contact_name is not null
                  or r.emergency_contact_phone is not null
                  or r.photo_consent is not null
                  -- #1647
                  or r.preferred_contact_detail is not null
                  -- #1501
                  or exists (select 1 from public.event_registration_answers a
                              where a.registration_id = r.id)
                  -- #1649
                  or exists (select 1 from public.event_carpool_passengers p
                              where p.registration_id = r.id)
                  or exists (select 1 from public.event_carpool_cars c
                              where c.driver_registration_id = r.id))
        );
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.event_registrations
             set name = 'Removed',
                 email = '',
                 phone = null,
                 notes = null,
                 -- #1418. A staff note on a cancellation can name somebody.
                 cancellation_note = null,
                 instagram_handle = null,
                 pronouns = null,
                 person_id = null,
                 accompanying_adult_name = null,
                 accompanying_adult_phone = null,
                 emergency_contact_name = null,
                 emergency_contact_phone = null,
                 photo_consent = null,
                 photo_consent_at = null,
                 photo_consent_text = null,
                 -- #1647. The number or address goes with the phone number.
                 has_no_instagram = null,
                 preferred_contact_method = null,
                 preferred_contact_detail = null
           where id = any(v_ids);
          -- #1501. The answers go with the name.
          delete from public.event_registration_answers
           where registration_id = any(v_ids);
          -- #1649. Out of any carpool, as a passenger or a driver. The car
          -- outlives its people.
          delete from public.event_carpool_passengers
           where registration_id = any(v_ids);
          update public.event_carpool_cars
             set driver_registration_id = null,
                 driver_assigned_at = null
           where driver_registration_id = any(v_ids);
        end if;

        -- #1649. A car's leaving-from and notes are staff text that can name
        -- somebody, purged on the same clock as the event's registrations.
        v_ids := array(
          select c.id
            from public.event_carpool_cars c
            join public.events e on e.id = c.event_id
           where c.tenant_id = v_tenant
             and coalesce(e.ends_at, e.starts_at) < p_as_of - v_period
             and (c.leaving_from is not null or c.notes is not null)
        );
        perform public.retention_log(v_run_id, 'event_registrations', 'event_carpool_cars', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.event_carpool_cars
             set leaving_from = null,
                 notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'event_registrations', 'event_registrations', 'skipped', sqlerrm);
    end;

    -- B. Volunteer applications. Two clocks: the published policy is "2 years
    -- after your last activity with us, or 1 year if the application is withdrawn
    -- or declined". There is no 'withdrawn' status in the check constraint
    -- (20260827000000) -- 'declined' and 'closed' are the states that mean it,
    -- and status is what selects the clock.
    --
    -- The main clock reads person_last_activity_at, not just the row's
    -- updated_at, so a 'placed' application belonging to a volunteer who is still
    -- turning up does not expire merely because nobody has edited the record.
    begin
      select period, secondary_period, mode into v_period, v_secondary, v_mode
        from public.retention_policies
         where policy_key = 'volunteer_applications' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.volunteer_applications a
           where a.tenant_id = v_tenant
             and case
                   when a.status in ('declined', 'closed')
                     then a.updated_at < p_as_of - v_secondary
                   else greatest(a.updated_at,
                                 public.person_last_activity_at(a.person_id))
                          < p_as_of - v_period
                 end
        );
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_applications where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', sqlerrm);
    end;

    -- E. Gear requests. The movement row is inventory history and stays; only the
    -- requester goes -- the link, and now the free text they wrote on the request
    -- form, which #721 moved off people.notes and onto the movement. Their name,
    -- email and phone are still not on the movement -- request_gear_items() puts
    -- those on a people row via resolve_or_create_person_by_email() -- so
    -- unlinking here is what lets the person rule below reach them.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.inventory_movements m
           where m.tenant_id = v_tenant
             and m.recipient_person_id is not null
             and m.movement_type in ('reserved', 'distributed')
             and m.occurred_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.inventory_movements set recipient_person_id = null, notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'inventory_movements', 'skipped', sqlerrm);
    end;

    -- E2. Gear request headers (#1032). The delivery method, the postage quote
    -- and the status are inventory history and stay; the requester link, the
    -- shipping address, the payment preference and the request notes go on the
    -- same clock as the movements above. Measured from the handover -- the
    -- fulfilment, else the cancellation, else the request itself.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'gear_requests', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.gear_requests r
           where r.tenant_id = v_tenant
             and (r.person_id is not null
                  or r.ship_line1 is not null
                  or r.payment_method is not null
                  or r.notes is not null)
             and coalesce(r.fulfilled_at, r.cancelled_at, r.created_at) < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'gear_requests', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.gear_requests
             set person_id = null,
                 ship_name = null,
                 ship_line1 = null,
                 ship_line2 = null,
                 ship_city = null,
                 ship_region = null,
                 ship_postal_code = null,
                 ship_country = null,
                 payment_method = null,
                 notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'gear_requests', 'skipped', sqlerrm);
    end;

    -- E3. In-person handout acknowledgements (#1519). When, what was shown and
    -- how stay -- a fact about an act and the organization's own words, as
    -- gear_requests.as_is_* do. The recipient link and the name they typed go,
    -- on the gear-request clock, measured from the handout.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'distribution_acknowledgements', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.distribution_acknowledgements a
           where a.tenant_id = v_tenant
             and (a.recipient_person_id is not null or a.typed_name is not null)
             and a.created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'distribution_acknowledgements', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.distribution_acknowledgements
             set recipient_person_id = null,
                 typed_name = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'distribution_acknowledgements', 'skipped', sqlerrm);
    end;


    -- D1. Rider profiles, and the backfill that has to come first.
    --
    -- The impact RPCs read coalesce(registration.*_at_event, the live people row)
    -- (20260904140000), and the snapshot trigger only stamps on the check-in
    -- transition (20260904120000). So any registration checked in before that
    -- migration, or whose person had no profile at the time, still resolves
    -- through people. Clearing the person's rider columns without stamping the
    -- snapshot first would silently change beginner counts on events that closed
    -- years ago. Backfill, then clear, in that order, in one transaction.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.riding_discipline is not null
             and public.person_last_activity_at(p.id) < p_as_of - v_period
        );

        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.people p on p.id = r.person_id
           where r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'event_registrations', 'backfilled', v_ids);

        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.event_registrations r
             set riding_discipline_at_event = p.riding_discipline,
                 ski_experience_level_at_event = p.ski_experience_level,
                 snowboard_experience_level_at_event = p.snowboard_experience_level
            from public.people p
           where p.id = r.person_id
             and r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids);
        end if;

        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'cleared', v_person_ids);

        -- All four columns in one statement: people_ski_level_requires_ski and
        -- people_snowboard_level_requires_snowboard (20260901050000) fire if a
        -- level outlives its discipline, which is why merge_people() handles them
        -- as a group too.
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set riding_discipline = null,
                 ski_experience_level = null,
                 snowboard_experience_level = null,
                 preferred_mountain = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- D2. Anonymize the person, when nothing else needs them.
    --
    -- Runs last of the person rules on purpose: retention_person_is_retained()
    -- has to observe the state after C, B and E dropped their references. In a
    -- dry run those references are still there, so this count is conservative --
    -- it reports the people who are *already* free, not the ones the same run
    -- would free. Say so on the page rather than trying to simulate it.
    --
    -- The row is never deleted. ~40 foreign keys point at people, nearly all
    -- NO ACTION, so a delete would fail for anyone with any history; is_anonymous
    -- is how this schema has always expressed "a person we keep no details for"
    -- (the donor_identified_or_anonymous check permits a null name only then, and
    -- people_email_key excludes anonymized rows from the unique index).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.auth_user_id is null
             and not p.is_anonymous
             and public.person_last_activity_at(p.id) < p_as_of - v_period
             and not public.retention_person_is_retained(p.id)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- F. Portal accounts.
    --
    -- auth.users is never touched. audit_log.actor_id references it with no ON
    -- DELETE, as do ~120 other created_by/updated_by columns across the schema, so
    -- deleting an account that ever wrote a row raises 23503 -- and the audit
    -- trail is retained separately for governance, security, audit, insurance and
    -- legal purposes anyway. What this rule does is clear the personal details on
    -- the linked people row and remove any role grant that outlived the
    -- deactivation. /privacy is worded to match (see the same PR).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'portal_accounts' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
            join public.deactivated_users d on d.user_id = p.auth_user_id
           where p.tenant_id = v_tenant
             and d.deactivated_at < p_as_of - v_period
             and not p.is_anonymous
        );
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          -- tenant_id, not just the user id. deactivated_users is platform-wide
          -- (20260906010000 keeps it global: one row per auth account), so the
          -- unscoped form deleted that account's roles in every tenant it belonged
          -- to -- the one place the purge wrote outside the tenant it was sweeping.
          delete from public.user_roles
           where tenant_id = v_tenant
             and user_id in (
               select p.auth_user_id from public.people p where p.id = any(v_person_ids)
             );
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'portal_accounts', 'people', 'skipped', sqlerrm);
    end;

    -- G. Unclaimed portal invitations. pending_role_grants holds an email address
    -- and its own header (20260824060000) says there is no cleanup job; this is
    -- that job. Note the residual: the table is audited, so the delete writes the
    -- email into audit_log.old_data, which has no clock of its own. That is a real
    -- if smaller exposure than leaving the live row, and is tracked separately.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'pending_role_grants' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', '{}');
      else
        v_ids := array(
          select g.id
            from public.pending_role_grants g
           where g.tenant_id = v_tenant
             and ((g.status in ('claimed', 'revoked') and g.created_at < p_as_of - v_period)
              or (g.status = 'pending' and g.expires_at < p_as_of - v_period))
        );
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.pending_role_grants where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', sqlerrm);
    end;

    -- I. Audit trail snapshots (#720). Redaction, not deletion.
    --
    -- Runs after every rule above on purpose: A, C, E and G have just written
    -- this tenant's old values into audit_log.old_data, and the entries they
    -- wrote tonight are the ones a reader would most expect to find scrubbed
    -- seven years from now. Order does not matter for correctness -- the clock
    -- is the entry's own occurred_at -- but it is the order the rules read in.
    --
    -- Only entries that still hold something are counted or touched: a snapshot
    -- whose registered keys are all jsonb null already is finished, and without
    -- that test it would be rewritten and re-reported every night forever.
    --
    -- Null tenant_id means an audit entry for one of the global tables
    -- (deactivated_users, retention_policies, tenants ...). Those belong to the
    -- platform tenant, which is how 20260906160000 backfilled the historical
    -- ones, so the oldest tenant's run is what sweeps them -- rather than their
    -- being visible to every tenant's admin and swept by none.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'audit_log_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.audit_log a
           where (a.tenant_id = v_tenant
                  or (a.tenant_id is null
                      and v_tenant = (select t.id from public.tenants t
                                       order by t.created_at limit 1)))
             and a.redacted_at is null
             and a.occurred_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data(a.table_name, a.old_data, a.new_data)
        );
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.audit_log a
             set old_data = public.retention_redact_snapshot(a.table_name, a.old_data),
                 new_data = public.retention_redact_snapshot(a.table_name, a.new_data),
                 redacted_at = now()
           where a.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', sqlerrm);
    end;

    -- J. Merge snapshots (#720). Same treatment, one clock later in the record's
    -- life: person_merges holds two whole people rows, and the registered people
    -- columns are the same eleven rules D1 and D2 clear on a live person. The
    -- merge itself -- who merged whom, when, and the counts of what moved -- is
    -- untouched, which is what the table exists for.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_merge_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.person_merges m
           where m.tenant_id = v_tenant
             and m.redacted_at is null
             and m.merged_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data('people', m.merged_snapshot, m.survivor_before)
        );
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.person_merges m
             set merged_snapshot = public.retention_redact_snapshot('people', m.merged_snapshot),
                 survivor_before = public.retention_redact_snapshot('people', m.survivor_before),
                 redacted_at = now()
           where m.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', sqlerrm);
    end;

    -- K. Staff messages and resent receipts (#1203). What survives is the fact
    -- of the send -- when, by whom, about which record, and whether it was
    -- delivered; what goes is the correspondence itself and everyone named in
    -- it. Cleared rather than deleted, for the same reason rule E2 keeps the
    -- gear request: the detail view says "three messages went out about this
    -- request" long after it may say what any of them were.
    --
    -- to_email, subject and body are not null, so they take the empty-string
    -- sentinel rule C uses rather than the constraints being dropped.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'outbound_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'outbound_messages', 'outbound_messages', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.outbound_messages m
           where m.tenant_id = v_tenant
             and (m.person_id is not null or m.to_email <> ''
                  or m.subject <> '' or m.body <> '')
             and m.created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'outbound_messages', 'outbound_messages', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.outbound_messages
             set person_id = null, to_email = '', subject = '', body = ''
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'outbound_messages', 'outbound_messages', 'skipped', sqlerrm);
    end;

    -- L. Record claims (#1296). What somebody typed to persuade us a record
    -- is theirs -- a name, usually an address or a phone number, sometimes a
    -- note -- which a refused claim leaves us holding about a person who is
    -- not the person in the record.
    --
    -- Deleted rather than cleared, like the volunteer application it most
    -- resembles: person_claims is audited, so the decision itself (approved or
    -- refused, by whom, when) survives in audit_log on its own clock, and
    -- nothing reports on a claim.
    --
    -- This rule has no audit-log residual, unlike rule G's. Every stated_*
    -- column and both notes are in audited_tables.redacted_columns
    -- (20260916060000), so the trigger strips them before recording -- the
    -- write-time half of the two mechanisms in docs/spec/audit.md. The delete
    -- therefore leaves no copy of what the claimant typed anywhere.
    --
    -- updated_at carries both questions the decision record asks on one clock.
    -- It is the moment of the decision for a claim somebody decided, and --
    -- defaulted to created_at and maintained by set_updated_at, which no
    -- client can backdate -- the moment it was sent for one nobody did.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_claims' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_claims', 'person_claims', 'skipped', '{}');
      else
        v_ids := array(
          select c.id
            from public.person_claims c
           where c.tenant_id = v_tenant
             and c.updated_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'person_claims', 'person_claims', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.person_claims where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_claims', 'person_claims', 'skipped', sqlerrm);
    end;

    -- M. Hours a volunteer logged themselves (#1296, #1165).
    --
    -- Only the entries that became nothing. A confirmed submission is the
    -- provenance of a volunteer_hours row -- the record that the volunteer
    -- entered those hours rather than a staffer entering them on their behalf
    -- -- so deleting it on a clock of its own would leave the ledger asserting
    -- something with nothing behind it. `status <> 'confirmed'` is therefore
    -- the predicate, not an age on every row; a confirmed entry whose ledger
    -- row was later deleted (the reference is on delete set null) stays too,
    -- because what it evidences is unchanged.
    --
    -- No audit-log residual here either: `notes` and `review_note` are in this
    -- table's redacted_columns (20260916090000), so the free text a volunteer
    -- wrote was never recorded in a snapshot to begin with.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'volunteer_hour_submissions' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'skipped', '{}');
      else
        v_ids := array(
          select s.id
            from public.volunteer_hour_submissions s
           where s.tenant_id = v_tenant
             and s.status <> 'confirmed'
             and s.updated_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_hour_submissions where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'skipped', sqlerrm);
    end;

    -- N, part two. The log line for the website-account rule, written once per
    -- tenant's run -- rule H's shape, and for its reason: a rule that appears
    -- in no run reads on the Data Retention page as a rule that was skipped.
    -- The count is the platform's, not this tenant's, and the page says so.
    --
    -- This tenant's own mode still decides what the line says: 'off' reports
    -- nothing rather than reporting a number this organization asked not to be
    -- shown a proposal for. It has already had its say in the unanimity test
    -- above, which is what stopped the delete.
    begin
      select mode into v_mode
        from public.retention_policies
       where policy_key = 'constituent_accounts' and tenant_id = v_tenant;

      if v_account_error is not null then
        v_failed := true;
        insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
        values (v_tenant, v_run_id, 'constituent_accounts', 'auth.users', 'skipped', v_account_error);
      elsif v_mode is null or v_mode = 'off' then
        perform public.retention_log(v_run_id, 'constituent_accounts', 'auth.users', 'skipped', '{}');
      else
        perform public.retention_log(v_run_id, 'constituent_accounts', 'auth.users', 'deleted', v_account_ids);
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'constituent_accounts', 'auth.users', 'skipped', sqlerrm);
    end;

    -- O. Volunteer screening outcomes (#1360).
    --
    -- coalesce(expires_on, cleared_on): a clearance that runs to 2032 is live
    -- until 2032, so the clock starts where the clearance ends, and falls back
    -- to the decision for one that never expires. The ::date cast is load
    -- bearing -- p_as_of is a timestamptz and both columns are date.
    --
    -- No audit-log residual to think about, and no redaction pass: this table
    -- has no free-text column, so the snapshot audit_log kept was already
    -- nothing but ids and dates.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_screenings' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_screenings', 'person_screenings', 'skipped', '{}');
      else
        v_ids := array(
          select s.id
            from public.person_screenings s
           where s.tenant_id = v_tenant
             and coalesce(s.expires_on, s.cleared_on) < (p_as_of - v_period)::date
        );
        perform public.retention_log(v_run_id, 'person_screenings', 'person_screenings', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.person_screenings where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_screenings', 'person_screenings', 'skipped', sqlerrm);
    end;

    update public.retention_runs
       set finished_at = now(),
           status = case when v_failed then 'partial' else 'succeeded' end
     where id = v_run_id;
  end loop;

  -- A single-tenant call answers with its run, which is what the portal needs
  -- to link straight to it. A sweep has no single run to name, and cron ignores
  -- the result.
  return v_result_run_id;
end;
$function$;
