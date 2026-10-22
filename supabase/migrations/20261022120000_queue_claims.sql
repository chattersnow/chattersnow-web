-- #1668 (step 1 of #1644): who is working each ops-inbox queue item.
--
-- The ops inbox counted work waiting on staff but never said who had picked
-- any of it up, so two people could work the same request, or everyone could
-- assume someone else had it. Each queue table gets the same pair of columns:
--
--   claimed_by_person_id  who is working the item (a person in the tenant)
--   claimed_at            when they took it
--
-- Both are null together (`<table>_claim_pair`), and the person is
-- tenant-checked by a composite foreign key onto `people (tenant_id, id)`, as
-- `event_checklist_items_owner_in_tenant` (#1660) does. Deleting the person
-- clears the claim and keeps the item.
--
-- One write path, `set_queue_item_claim()`. Security definer rather than an
-- UPDATE policy: gear_requests, person_claims and volunteer_hour_submissions
-- have no staff UPDATE policy (staff write through RPCs), and a policy wide
-- enough to set a claim would open the whole row. It checks "claim yourself"
-- and "assign someone else" separately even though both are the queue's
-- `manage` today, so a narrower act permission later needs no schema change.
--
-- When a claim clears. A claim marks who is working an item, so it survives
-- intermediate states and clears on resolution. The clear is written into each
-- resolution path; there is deliberately no trigger guessing at it.
--
--   Queue                   Keeps the claim               Clears the claim               Where
--   Item requests           new, quoted, paid             fulfilled, cancelled           set_gear_request_status()
--   Account claims          pending                       approved, rejected, withdrawn  review_person_claim(); claimant withdraw policy
--   Self-logged hours       pending                       confirmed, declined            review_volunteer_hour_submission()
--   Volunteer applications  new, being reviewed, contacted placed, declined, closed      volunteers/applications/actions.ts
--   Messages                new, read                     resolved                       communications/actions.ts
--   Artwork                 pending                       approved, rejected             artwork/actions.ts
--
-- Reopening a resolved item, where a path allows it, therefore comes back
-- unclaimed. There is no check constraint tying a resolved status to a null
-- claim: `main` (which predates this) still resolves messages, applications
-- and artwork with a plain status update, and against a claim set from a
-- newer deployment that update would start failing.
--
-- Additive and nullable, and the redefined resolution RPCs keep their
-- signatures. One thing does reach `main`: the claim FK is a second
-- relationship from gear_requests, person_claims, volunteer_hour_submissions
-- and volunteer_applications to `people`, so PostgREST refuses a bare
-- `people(...)` embed on them (PGRST201). Development names the FK on every
-- such embed; `main` does not, so this migration goes to production together
-- with a development -> main release, not ahead of it. The claimant/volunteer select policies
-- on person_claims and volunteer_hour_submissions now return the claimant's
-- person id with the row: an id, which resolves to nobody without people:view.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

do $columns$
declare
  v_table text;
begin
  foreach v_table in array array[
    'gear_requests', 'person_claims', 'volunteer_hour_submissions',
    'volunteer_applications', 'contact_messages', 'artwork_submissions'
  ]
  loop
    execute format(
      'alter table public.%1$I
         add column claimed_by_person_id uuid,
         add column claimed_at timestamptz,
         add constraint %2$I
           foreign key (tenant_id, claimed_by_person_id)
           references public.people (tenant_id, id) on delete set null (claimed_by_person_id),
         add constraint %3$I
           check ((claimed_by_person_id is null) = (claimed_at is null))',
      v_table, v_table || '_claimed_by_in_tenant', v_table || '_claim_pair'
    );
    execute format(
      'create index %1$I on public.%2$I (claimed_by_person_id) where claimed_by_person_id is not null',
      v_table || '_claimed_by_idx', v_table
    );
    execute format(
      'comment on column public.%1$I.claimed_by_person_id is %2$L',
      v_table,
      'Who is working this item (#1668). Optional; a person in the row''s tenant. Set only through set_queue_item_claim(), cleared when the item is resolved.'
    );
    execute format(
      'comment on column public.%1$I.claimed_at is %2$L',
      v_table,
      'When the current claim was taken (#1668). Null exactly when claimed_by_person_id is.'
    );
  end loop;
end
$columns$;

-- `on delete set null (claimed_by_person_id)` leaves claimed_at behind, which
-- the pair check refuses -- so deleting a claimant would fail instead of
-- clearing. A plain FK action cannot null two columns of which only one is in
-- the key, so the person's claims are cleared before the row goes.
create function public.clear_queue_claims_of_deleted_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gear_requests set claimed_by_person_id = null, claimed_at = null
   where tenant_id = old.tenant_id and claimed_by_person_id = old.id;
  update public.person_claims set claimed_by_person_id = null, claimed_at = null
   where tenant_id = old.tenant_id and claimed_by_person_id = old.id;
  update public.volunteer_hour_submissions set claimed_by_person_id = null, claimed_at = null
   where tenant_id = old.tenant_id and claimed_by_person_id = old.id;
  update public.volunteer_applications set claimed_by_person_id = null, claimed_at = null
   where tenant_id = old.tenant_id and claimed_by_person_id = old.id;
  update public.contact_messages set claimed_by_person_id = null, claimed_at = null
   where tenant_id = old.tenant_id and claimed_by_person_id = old.id;
  update public.artwork_submissions set claimed_by_person_id = null, claimed_at = null
   where tenant_id = old.tenant_id and claimed_by_person_id = old.id;
  return old;
end;
$$;

revoke execute on function public.clear_queue_claims_of_deleted_person() from public, anon, authenticated;

create trigger clear_queue_claims_before_delete
  before delete on public.people
  for each row execute function public.clear_queue_claims_of_deleted_person();

-- ---------------------------------------------------------------------------
-- 2. set_queue_item_claim()
-- ---------------------------------------------------------------------------

create function public.set_queue_item_claim(
  p_queue text,
  p_id uuid,
  p_person_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_table text;
  -- Who may claim an item for themselves, and who may assign it to (or take it
  -- from) someone else. The same resource at `manage` on every queue today.
  v_act_resource text;
  v_assign_resource text;
  v_resolved text[];
  v_status text;
  v_current uuid;
  v_me uuid := public.my_person_id();
begin
  case p_queue
    when 'gear_requests' then
      v_table := 'gear_requests';
      v_act_resource := 'inventory';
      v_assign_resource := 'inventory';
      v_resolved := array['fulfilled', 'cancelled'];
    when 'person_claims' then
      v_table := 'person_claims';
      v_act_resource := 'constituent_claims';
      v_assign_resource := 'constituent_claims';
      v_resolved := array['approved', 'rejected', 'withdrawn'];
    when 'volunteer_hours' then
      v_table := 'volunteer_hour_submissions';
      v_act_resource := 'volunteers';
      v_assign_resource := 'volunteers';
      v_resolved := array['confirmed', 'declined'];
    when 'volunteer_applications' then
      v_table := 'volunteer_applications';
      v_act_resource := 'volunteers';
      v_assign_resource := 'volunteers';
      v_resolved := array['placed', 'declined', 'closed'];
    when 'contact_messages' then
      v_table := 'contact_messages';
      v_act_resource := 'communications';
      v_assign_resource := 'communications';
      v_resolved := array['resolved'];
    when 'artwork_submissions' then
      v_table := 'artwork_submissions';
      v_act_resource := 'artwork_submissions';
      v_assign_resource := 'artwork_submissions';
      v_resolved := array['approved', 'rejected'];
    else
      raise exception 'QUEUE_INVALID';
  end case;

  -- EXECUTE ... INTO does not set FOUND; status is never null, so a null here
  -- is the missing row.
  execute format(
    'select status, claimed_by_person_id from public.%I
      where id = $1 and tenant_id = $2
      for update',
    v_table
  )
  into v_status, v_current
  using p_id, v_tenant_id;

  if v_status is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  -- Yourself, or releasing your own claim, is acting on the queue; anyone else
  -- is assigning.
  if (p_person_id is not null and p_person_id = v_me)
     or (p_person_id is null and v_current is not distinct from v_me and v_me is not null) then
    if not public.has_permission(v_act_resource, 'manage') then
      raise exception 'PERMISSION_DENIED';
    end if;
  elsif not public.has_permission(v_assign_resource, 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_person_id is not null then
    if v_status = any (v_resolved) then
      raise exception 'ITEM_RESOLVED';
    end if;
    -- The foreign key refuses another tenant's person too; this answers with
    -- a code the portal can say in a sentence. The assignee is not required to
    -- hold the permission: the picker offers staff, the database does not
    -- police it.
    if not exists (
      select 1 from public.people where id = p_person_id and tenant_id = v_tenant_id
    ) then
      raise exception 'PERSON_NOT_FOUND';
    end if;
  end if;

  -- Re-claiming for the person who already has it keeps the original time.
  execute format(
    'update public.%I
        set claimed_by_person_id = $1,
            claimed_at = case
              when $1 is null then null
              when claimed_by_person_id is not distinct from $1 then claimed_at
              else now()
            end
      where id = $2',
    v_table
  )
  using p_person_id, p_id;
end;
$$;

revoke execute on function public.set_queue_item_claim(text, uuid, uuid) from public, anon;
grant execute on function public.set_queue_item_claim(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Unclaimed artwork count
-- ---------------------------------------------------------------------------

-- A second function rather than a second column on
-- count_pending_artwork_submissions(): `main` calls that one and reads an
-- integer back. Same permission check, inside.
create function public.count_unclaimed_pending_artwork_submissions()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_permission('artwork_submissions', 'view') then (
      select count(*)::integer
        from public.artwork_submissions
       where tenant_id = public.current_tenant_id()
         and status = 'pending'
         and claimed_by_person_id is null
    )
    else 0
  end;
$$;

revoke execute on function public.count_unclaimed_pending_artwork_submissions() from public, anon;
grant execute on function public.count_unclaimed_pending_artwork_submissions() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Resolution paths that clear the claim
-- ---------------------------------------------------------------------------

-- Bodies are 20261011120000's, 20260916100000's and 20260916090000's with the
-- clear added to each resolving update. Signatures unchanged.

create or replace function public.set_gear_request_status(
  p_request_id uuid,
  p_status text,
  p_quoted_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_request public.gear_requests%rowtype;
  v_item_id uuid;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_request
    from public.gear_requests
   where id = p_request_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status in ('fulfilled', 'cancelled') then
    raise exception 'REQUEST_CLOSED';
  end if;

  if p_status = 'quoted' then
    if v_request.delivery_method <> 'shipping' then
      raise exception 'NOT_SHIPPING';
    end if;
    if p_quoted_amount is null or p_quoted_amount < 0 then
      raise exception 'QUOTE_AMOUNT_REQUIRED';
    end if;
    update public.gear_requests
       set status = 'quoted',
           quoted_amount = p_quoted_amount,
           quoted_at = now(),
           paid_at = null,
           updated_by = auth.uid()
     where id = p_request_id;

  elsif p_status = 'paid' then
    if v_request.delivery_method <> 'shipping' then
      raise exception 'NOT_SHIPPING';
    end if;
    if v_request.quoted_at is null then
      raise exception 'QUOTE_REQUIRED';
    end if;
    update public.gear_requests
       set status = 'paid',
           paid_at = now(),
           updated_by = auth.uid()
     where id = p_request_id;

  elsif p_status = 'fulfilled' then
    update public.gear_requests
       set status = 'fulfilled',
           fulfilled_at = now(),
           claimed_by_person_id = null,
           claimed_at = null,
           updated_by = auth.uid()
     where id = p_request_id;

    -- Whatever this request still holds is handed over to the requester.
    for v_item_id in
      select i.id
        from public.inventory_items i
       where i.tenant_id = v_tenant_id
         and i.status = 'reserved'
         and i.id in (
           select m.inventory_item_id
             from public.inventory_movements m
            where m.gear_request_id = p_request_id
              and m.movement_type = 'reserved'
         )
       order by i.id
         for update of i
    loop
      insert into public.inventory_movements
        (tenant_id, inventory_item_id, movement_type, quantity, reason,
         recipient_person_id, gear_request_id)
      values
        (v_tenant_id, v_item_id, 'distributed', 1, 'Gear request fulfilled',
         v_request.person_id, p_request_id);

      update public.inventory_items
         set status = 'distributed',
             updated_by = auth.uid()
       where id = v_item_id;
    end loop;

  elsif p_status = 'cancelled' then
    update public.gear_requests
       set status = 'cancelled',
           cancelled_at = now(),
           claimed_by_person_id = null,
           claimed_at = null,
           updated_by = auth.uid()
     where id = p_request_id;

    -- Whatever this request was still holding goes back on the shelf. An item
    -- already handed over (distributed) or otherwise moved on is left alone.
    update public.inventory_items i
       set status = 'available',
           updated_by = auth.uid()
     where i.tenant_id = v_tenant_id
       and i.status = 'reserved'
       and i.id in (
         select m.inventory_item_id
           from public.inventory_movements m
          where m.gear_request_id = p_request_id
            and m.movement_type = 'reserved'
       );

  else
    raise exception 'STATUS_INVALID';
  end if;
end;
$$;

create or replace function public.review_person_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_person_id uuid default null,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.person_claims;
  v_tenant_id uuid := public.current_tenant_id();
  v_person_id uuid := p_person_id;
  v_existing uuid;
begin
  if not public.has_permission('constituent_claims', 'manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_claim
    from public.person_claims c
   where c.id = p_claim_id
     and c.tenant_id = v_tenant_id
     for update;

  if v_claim.id is null then
    raise exception 'No such claim';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'This claim has already been %', v_claim.status;
  end if;

  if not p_approve then
    update public.person_claims
       set status = 'rejected',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           review_note = nullif(btrim(coalesce(p_review_note, '')), ''),
           claimed_by_person_id = null,
           claimed_at = null
     where id = p_claim_id;
    return null;
  end if;

  -- One account is one person per tenant, and one person is one account:
  -- people_auth_user_id_key enforces the first, and this check the second.
  -- Without it, approving a second claim against the same record would fail on
  -- the index with a message about a constraint rather than about the person.
  if v_person_id is not null then
    select p.auth_user_id into v_existing
      from public.people p
     where p.id = v_person_id and p.tenant_id = v_tenant_id;

    if not found then
      raise exception 'No such person in this organization';
    end if;
    if v_existing is not null and v_existing <> v_claim.auth_user_id then
      raise exception 'That record is already linked to a different account';
    end if;
  end if;

  if exists (
    select 1 from public.people p
     where p.auth_user_id = v_claim.auth_user_id and p.tenant_id = v_tenant_id
  ) then
    raise exception 'That account is already linked to a record';
  end if;

  if v_person_id is null then
    insert into public.people (
      tenant_id, name, is_anonymous, source_type, email, phone,
      instagram_handle, auth_user_id, created_by
    )
    values (
      v_tenant_id,
      v_claim.stated_name,
      false,
      'other',
      v_claim.stated_email,
      v_claim.stated_phone,
      public.normalize_instagram_handle(v_claim.stated_instagram_handle),
      v_claim.auth_user_id,
      auth.uid()
    )
    returning id into v_person_id;
  else
    update public.people
       set auth_user_id = v_claim.auth_user_id
     where id = v_person_id;
  end if;

  update public.person_claims
     set status = 'approved',
         claimed_person_id = v_person_id,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_review_note, '')), ''),
         claimed_by_person_id = null,
         claimed_at = null
   where id = p_claim_id;

  return v_person_id;
end;
$$;

create or replace function public.review_volunteer_hour_submission(
  p_submission_id uuid,
  p_confirm boolean,
  p_note text default null,
  p_hours numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_submission public.volunteer_hour_submissions;
  v_hours numeric;
  v_hours_id uuid;
begin
  if not public.has_permission('volunteers', 'manage') then
    raise exception 'Not authorized to review volunteer hours';
  end if;

  select * into v_submission
    from public.volunteer_hour_submissions
   where id = p_submission_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  -- Already decided. Raising rather than quietly re-deciding: two reviewers
  -- opening the same queue is the ordinary case, and the second one needs to
  -- know their click did nothing rather than to be shown a success.
  if v_submission.status <> 'pending' then
    raise exception 'ALREADY_REVIEWED';
  end if;

  if not p_confirm then
    update public.volunteer_hour_submissions
       set status = 'declined',
           reviewed_by = (select auth.uid()),
           reviewed_at = now(),
           review_note = nullif(btrim(coalesce(p_note, '')), ''),
           claimed_by_person_id = null,
           claimed_at = null
     where id = p_submission_id;
    return;
  end if;

  v_hours := coalesce(p_hours, v_submission.hours);
  if v_hours <= 0 or v_hours > 24 then
    raise exception 'INVALID_HOURS';
  end if;

  insert into public.volunteer_hours
    (tenant_id, person_id, event_id, volunteer_role_type_id, hours, logged_date,
     notes, logged_by, updated_by)
  values
    (v_submission.tenant_id, v_submission.person_id, v_submission.event_id,
     v_submission.volunteer_role_type_id, v_hours, v_submission.logged_date,
     v_submission.notes, coalesce(v_submission.created_by, (select auth.uid())),
     (select auth.uid()))
  returning id into v_hours_id;

  update public.volunteer_hour_submissions
     set status = 'confirmed',
         hours = v_hours,
         volunteer_hours_id = v_hours_id,
         reviewed_by = (select auth.uid()),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         claimed_by_person_id = null,
         claimed_at = null
   where id = p_submission_id;
end;
$$;

-- The claimant's withdraw is a plain update under this policy, so the clear
-- is a condition of it: a withdrawn claim must carry no staff claim (and with
-- the pair check, no claimed_at). It also stops a claimant from writing a
-- staff claim onto their own row on the way out.
drop policy "claimant withdraws own claim" on public.person_claims;
create policy "claimant withdraws own claim" on public.person_claims
  for update to authenticated
  using (
    tenant_id = (select public.public_tenant_id())
    and auth_user_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    tenant_id = (select public.public_tenant_id())
    and auth_user_id = (select auth.uid())
    and status = 'withdrawn'
    and claimed_by_person_id is null
  );
