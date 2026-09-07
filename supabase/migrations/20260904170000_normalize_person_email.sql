-- Email is already this schema's person identity key, and nothing enforces it.
-- resolve_or_create_person_by_email (20260824150000, current body in
-- 20260903020000) dedupes intake on lower(email); resolve_current_person_id
-- (20260823140000), ensure_current_person / set_preferred_name_for_user
-- (20260902040000) and the 20260902050000 backfill all bind a portal login to a
-- directory row on lower(email). Yet people.email is nullable text with no
-- unique constraint and no index of any kind -- so the same person can exist
-- several times over, splitting their donations, hours and registrations, and
-- every one of those lookups is a sequential scan that settles ties with
-- `order by created_at asc limit 1`.
--
-- Making the column unique is a two-migration job: the constraint cannot go on
-- while prod still holds duplicates. This migration does the half that is safe
-- on dirty data -- canonicalize, index, close the intake hole -- and
-- 20260904190000_enforce_unique_person_email.sql adds the unique index once the
-- People > Duplicates screen reports clean.
--
-- No column is added or dropped here, so the people_with_roles / primary_contact
-- drop-and-recreate that 20260903030000 warns about does NOT apply: `p.*` is
-- expanded over columns, and an index, trigger or check constraint is invisible
-- to it.

-- 1. Canonicalize what is already stored. Blank becomes null rather than '':
-- blank email carries no identity to dedupe on, the reasoning already settled
-- in 20260901010000_fix_event_registrations_blank_email_collision.sql.
update public.people
   set email = nullif(lower(trim(email)), '')
 where email is distinct from nullif(lower(trim(email)), '');

-- 2. Keep it canonical. One trigger rather than edits to the five security
-- definer RPCs that each insert a caller-supplied email verbatim
-- (resolve_or_create_person_by_email, create_donation_with_items,
-- ensure_current_person, set_preferred_name_for_user, and the 20260902050000
-- backfill's shape). A trigger also covers every writer added later, which a
-- round of call-site edits would not.
create function public.normalize_person_email()
returns trigger
language plpgsql
as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  return new;
end;
$$;

create trigger normalize_person_email
  before insert or update on public.people
  for each row execute function public.normalize_person_email();

-- 3. Make the invariant checkable rather than merely conventional, so a future
-- writer that somehow bypasses the trigger fails loudly instead of
-- reintroducing the '' rows step 1 just cleared.
alter table public.people
  add constraint people_email_not_blank check (email is null or email <> '');

-- 4. Non-unique for now; 20260904190000_enforce_unique_person_email.sql swaps it.
--
-- The predicate is deliberately `email is not null and not is_anonymous` and
-- deliberately NOT `email <> ''`. A partial index is only usable when the
-- planner can prove its predicate from the query, and the query every caller
-- writes is `where lower(email) = lower($1)`: lower() is strict so
-- `email is not null` is provable, but `email <> ''` is not -- including it
-- would cost this index the exact lookup it exists to serve. Step 3's check
-- constraint carries that half instead.
create index people_email_idx
  on public.people (lower(email))
  where email is not null and not is_anonymous;

-- 5. Teach the intake resolver about anonymity, which it has never known.
--
-- create_donation_with_items' anonymous branch (20260824170000) always inserts
-- a fresh row, by design -- matching an anonymous donor by email is meaningless.
-- But the resolver it bypasses has no matching filter, so an anonymous row
-- created first *wins* `order by created_at asc limit 1` for a later real
-- registration at the same address: the attendee silently lands on the
-- anonymous donor's record. Filtering here fixes that, and is also what makes
-- step 4's partial predicate provable for this call site.
--
-- Body is 20260903020000's verbatim apart from that one clause; p_role_flag
-- stays accepted-and-ignored for the same reason recorded there.
create or replace function public.resolve_or_create_person_by_email(
  p_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_source_type text default 'other',
  p_role_flag text default null, -- accepted and ignored; see 20260903020000
  p_instagram_handle text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  if p_email is not null and p_email <> '' then
    select id into v_person_id
    from public.people
    where lower(email) = lower(p_email)
      and not is_anonymous
    order by created_at asc
    limit 1;
  end if;

  if v_person_id is not null then
    return v_person_id;
  end if;

  insert into public.people
    (name, is_anonymous, source_type, email, phone, notes, created_by, instagram_handle)
  values (
    p_name, false, p_source_type, p_email, p_phone, p_notes, auth.uid(), p_instagram_handle
  )
  returning id into v_person_id;

  return v_person_id;
end;
$$;
