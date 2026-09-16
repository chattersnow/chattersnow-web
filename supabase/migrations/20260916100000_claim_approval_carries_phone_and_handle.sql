-- Approving a claim that matched nobody kept only the name and the email
-- (#1184).
--
-- The form asks a claimant for a phone number and an Instagram handle,
-- `person_claims` stores both, and `review_person_claim()` then built the new
-- `people` row from `stated_name` and `stated_email` alone. So a newcomer was
-- asked for two identifiers, accepted without comment, approved, and ended up
-- on a record carrying neither -- with no way to find that out.
--
-- The handle is the worse loss. It is the identifier most likely to be the only
-- one on a record created from an event registration, which is why the claim
-- form asks for it at all, so dropping it on the create path throws away the
-- one value that would have matched a future duplicate.
--
-- Only the create path changes. Approving against an existing record still
-- writes nothing but `auth_user_id`: the directory's own values are a
-- staffer's, and a claimant is not a source of corrections to them (that is
-- what `/my/details` and #1167 are for).
--
-- The handle goes through `normalize_instagram_handle()` on the way in.
-- `submit_person_claim()` already normalizes before storing, so this is
-- idempotent today; it is here because `people.instagram_handle` carries its
-- own `^[A-Za-z0-9._]{1,30}$` check and this insert is the thing that has to
-- satisfy it, whatever a later writer puts in `stated_instagram_handle`.
--
-- The phone is carried as typed. Nothing else in this schema normalizes a phone
-- number -- `record_person_intake()` writes what it is given -- and inventing a
-- format here would make the directory disagree with itself.

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
           review_note = nullif(btrim(coalesce(p_review_note, '')), '')
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
         review_note = nullif(btrim(coalesce(p_review_note, '')), '')
   where id = p_claim_id;

  return v_person_id;
end;
$$;

comment on function public.review_person_claim(uuid, boolean, uuid, text) is
  'Approve or reject a claim (#1162). Approving links people.auth_user_id, or creates a record when the claimant matched nobody -- from the name, email, phone and Instagram handle they stated (#1184) -- and marks the claim in the same transaction. Requires constituent_claims:manage.';
