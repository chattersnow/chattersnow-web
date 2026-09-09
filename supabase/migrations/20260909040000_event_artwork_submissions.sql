-- #870: community artwork submissions, for the expo zine and for every call
-- that comes after it.
--
-- Three tables, one private bucket, two anon RPCs. The shape is the one every
-- public intake in this project already uses -- a SECURITY DEFINER RPC that
-- re-enforces the rate limit, the honeypot and the validation, over a table
-- `anon` cannot touch (submit_contact_message, 20260906060000) -- with one new
-- problem on top: the visitor has a 10 MB file to hand over, and nothing in
-- this project has ever let an unauthenticated caller write to Storage.
--
-- Two obvious routes are closed. Posting the file through a Server Action does
-- not survive the platform: Next caps a Server Action body at 1 MB by default
-- and Vercel caps a serverless request body at 4.5 MB. Giving `anon` an insert
-- policy on storage.objects would put an unauthenticated write faucet on the
-- same Supabase project as production -- the hazard the
-- `not current_tenant_is_demo()` line in 20260907160000 exists to close.
--
-- So the bucket below carries no anon policy at all. A rate-limited Server
-- Action mints a one-shot signed upload URL, with the service-role client, for
-- a path *the server* chooses; the browser PUTs straight to Storage. The
-- object exists before any row references it, which is why the daily purge job
-- grew a second sweep in this same change.

-- Artwork calls ---------------------------------------------------------------

-- One call per event. The call, not the event, is what a visitor reaches: the
-- code below is the whole address, so a call that was never opened is
-- indistinguishable from one that does not exist.
create table public.event_artwork_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- Uppercase, from the unambiguous alphabet generate_volunteer_reference_code
  -- uses (no I, L, O, 0, 1) because this one gets read off a flyer and typed
  -- by hand as often as it gets scanned.
  submission_code text not null check (submission_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$'),
  is_open boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  intro text,
  max_images integer not null default 3 check (max_images between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  -- One call per event: the event is how staff find it and how the queue is
  -- grouped, and a second call on the same event would split the queue in two
  -- with no way to tell which link a submitter used.
  unique (event_id),
  unique (tenant_id, submission_code),
  constraint event_artwork_calls_window check (closes_at is null or opens_at is null or closes_at >= opens_at)
);

comment on table public.event_artwork_calls is
  'A per-event call for community artwork (#870). submission_code is the entire address of the public upload page -- link-only, never in nav, and an unknown or closed code 404s.';

create index event_artwork_calls_tenant_id_idx on public.event_artwork_calls (tenant_id);
create index event_artwork_calls_event_id_idx on public.event_artwork_calls (event_id);

create trigger set_updated_at before update on public.event_artwork_calls
  for each row execute function public.set_updated_at();

alter table public.event_artwork_calls enable row level security;

create policy "event_artwork_calls select" on public.event_artwork_calls for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'view')
  );
create policy "event_artwork_calls insert" on public.event_artwork_calls for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );
create policy "event_artwork_calls update" on public.event_artwork_calls for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );
create policy "event_artwork_calls delete" on public.event_artwork_calls for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );

grant select, insert, update, delete on public.event_artwork_calls to authenticated;

-- Submissions -----------------------------------------------------------------

create table public.artwork_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  call_id uuid not null references public.event_artwork_calls(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  submitter_name text not null,
  submitter_email text not null,
  title text,
  medium text,
  artist_statement text,
  -- text + check, never a Postgres enum -- the convention every status column
  -- in this schema follows (volunteer_applications, reimbursements), because
  -- widening a check constraint is one `alter table` and widening an enum is
  -- not transactional in older Postgres.
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

comment on table public.artwork_submissions is
  'One community artwork submission (#870). Written only by submit_artwork(); anon has no grant here.';

create index artwork_submissions_tenant_id_idx on public.artwork_submissions (tenant_id);
create index artwork_submissions_status_idx on public.artwork_submissions (status);
create index artwork_submissions_call_created_idx on public.artwork_submissions (call_id, created_at desc);

create trigger set_updated_at before update on public.artwork_submissions
  for each row execute function public.set_updated_at();

alter table public.artwork_submissions enable row level security;

create policy "artwork_submissions select" on public.artwork_submissions for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'view')
  );
create policy "artwork_submissions insert" on public.artwork_submissions for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );
create policy "artwork_submissions update" on public.artwork_submissions for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );
create policy "artwork_submissions delete" on public.artwork_submissions for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );

grant select, insert, update, delete on public.artwork_submissions to authenticated;

-- Images ----------------------------------------------------------------------

-- Two objects per artwork. The original is stored untouched because a zine is
-- printed: the 1600px q0.8 JPEG that compressImage() produces is the review
-- thumbnail and nothing more. Without the thumbnail a review grid of thirty
-- submissions would pull ~900 MB of egress against a 5 GB free-tier month.
create table public.artwork_submission_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  submission_id uuid not null references public.artwork_submissions(id) on delete cascade,
  storage_path text not null unique,
  thumb_path text not null unique,
  content_type text not null,
  byte_size bigint,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

comment on column public.artwork_submission_images.storage_path is
  'Object path in the private artwork-submissions bucket. Unique across the table on purpose: it is what stops a path from being replayed onto a second submission.';

create index artwork_submission_images_tenant_id_idx on public.artwork_submission_images (tenant_id);
create index artwork_submission_images_submission_idx on public.artwork_submission_images (submission_id, position);

alter table public.artwork_submission_images enable row level security;

create policy "artwork_submission_images select" on public.artwork_submission_images for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'view')
  );
create policy "artwork_submission_images insert" on public.artwork_submission_images for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );
create policy "artwork_submission_images update" on public.artwork_submission_images for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );
create policy "artwork_submission_images delete" on public.artwork_submission_images for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('artwork_submissions', 'manage')
  );

grant select, insert, update, delete on public.artwork_submission_images to authenticated;

-- Storage ---------------------------------------------------------------------

-- Private, which is simply the §7.5 default -- unlike gear-photos, nothing here
-- is already public, and an unpublished artist's work is exactly the material
-- that rule exists for. Reviewers read through short-lived signed URLs minted
-- server-side behind a permission check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artwork-submissions',
  'artwork-submissions',
  false,
  10485760, -- 10 MiB, the per-image cap the form states.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- There is deliberately no policy for `anon` on this bucket, and no insert
-- policy for anyone. Every write arrives through a signed upload URL minted by
-- the service-role client, which bypasses RLS; adding an insert policy here
-- would only widen the surface without enabling anything.
--
-- `(select public.current_tenant_id())` is wrapped so the planner evaluates it
-- once as an InitPlan rather than per row (the rule stated at
-- 20260905180000:119-121); has_permission() takes arguments and is left bare.

-- Read. Required, not optional: storage-api resolves .list() and .remove()
-- through select, so without this a Remove returns an empty array and deletes
-- nothing. Signed-URL creation goes through the service-role client and does
-- not depend on it.
drop policy if exists "artwork-submissions tenant select" on storage.objects;
create policy "artwork-submissions tenant select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'artwork-submissions'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('artwork_submissions', 'view')
  );

-- Delete, at manage, so a reviewer can destroy something abusive on the spot
-- rather than waiting a day for the purge job to notice the row is gone.
drop policy if exists "artwork-submissions tenant delete" on storage.objects;
create policy "artwork-submissions tenant delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'artwork-submissions'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('artwork_submissions', 'manage')
  );

-- Code generation --------------------------------------------------------------

create or replace function public.generate_artwork_submission_code(p_tenant_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_tenant_id uuid := coalesce(p_tenant_id, public.default_tenant_id());
begin
  loop
    select string_agg(substr(v_chars, (ceil(random() * length(v_chars)))::int, 1), '')
    into v_code
    from generate_series(1, 12);

    exit when not exists (
      select 1 from public.event_artwork_calls
       where submission_code = v_code and tenant_id = v_tenant_id
    );
  end loop;

  return v_code;
end;
$$;

comment on function public.generate_artwork_submission_code(uuid) is
  '12 characters from a 31-character unambiguous alphabet: ~5.9e17 codes, so enumeration is infeasible and the rate limit on get_artwork_call is belt-and-braces.';

revoke execute on function public.generate_artwork_submission_code(uuid) from public;
grant execute on function public.generate_artwork_submission_code(uuid) to authenticated;

alter table public.event_artwork_calls
  alter column submission_code set default public.generate_artwork_submission_code();

-- Public RPCs -----------------------------------------------------------------

-- What the public page renders. Returns nothing for a code that is unknown,
-- closed, or outside its window -- the caller turns an empty result into a 404,
-- so the URL space leaks nothing about which calls exist.
create or replace function public.get_artwork_call(
  p_code text,
  p_ip_address inet default null
)
returns table (
  call_id uuid,
  event_id uuid,
  event_name text,
  starts_at timestamptz,
  location text,
  intro text,
  max_images integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
begin
  -- 30, not the 5 an intake form gets: this fires on every render of the page,
  -- including the reload a submitter does after a failed upload.
  if not public.check_rate_limit('get_artwork_call', p_ip_address, 30, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_tenant_id is null then
    return;
  end if;

  return query
  select c.id, c.event_id, e.name, e.starts_at, e.location, c.intro, c.max_images
    from public.event_artwork_calls c
    join public.events e on e.id = c.event_id and e.tenant_id = c.tenant_id
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());
end;
$$;

grant execute on function public.get_artwork_call(text, inet) to anon, authenticated;

-- Called before the browser starts encoding, so a closed call or an exhausted
-- rate limit is reported in a second rather than after several megabytes have
-- moved. It returns the two ids the Server Action needs to build object paths;
-- the action does the actual signing with the service-role client.
create or replace function public.claim_artwork_upload_slots(
  p_code text,
  p_count integer,
  p_ip_address inet default null
)
returns table (
  tenant_id uuid,
  event_id uuid,
  max_images integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_call public.event_artwork_calls;
begin
  -- The tightest limit in this feature, because this is the one call that
  -- creates writable capacity in a paid-by-the-gigabyte bucket. Twenty slots
  -- per quarter hour is six full submissions.
  if not public.check_rate_limit('claim_artwork_upload_slots', p_ip_address, 20, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_tenant_id is null then
    raise exception 'CALL_CLOSED';
  end if;

  select c.* into v_call
    from public.event_artwork_calls c
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());

  if v_call.id is null then
    raise exception 'CALL_CLOSED';
  end if;

  if coalesce(p_count, 0) < 1 or p_count > v_call.max_images then
    raise exception 'TOO_MANY_IMAGES';
  end if;

  return query select v_call.tenant_id, v_call.event_id, v_call.max_images;
end;
$$;

grant execute on function public.claim_artwork_upload_slots(text, integer, inet) to anon, authenticated;

-- The intake. Order inside is the order every other public RPC here uses:
-- rate limit, honeypot, validation, tenant, then the write.
create or replace function public.submit_artwork(
  p_code text,
  p_name text,
  p_email text,
  p_title text,
  p_medium text,
  p_statement text,
  p_images jsonb,
  p_honeypot text default null,
  p_ip_address inet default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_call public.event_artwork_calls;
  v_submission_id uuid;
  v_image jsonb;
  v_position integer := 0;
  -- Built from the resolved ids rather than from a wildcard, so a path can
  -- only ever name an object inside this tenant's folder for this event. The
  -- three uuid segments are the draft id and the image id, both minted by the
  -- Server Action; guessing one is not a threat model, but a `../` in a
  -- hand-rolled request is, and this is what refuses it.
  v_uuid text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_prefix text;
begin
  if not public.check_rate_limit('submit_artwork', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- A filled honeypot gets an id for a row that was never written, so a bot
  -- sees the same success a person does and has nothing to tune against.
  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;

  if v_tenant_id is null then
    raise exception 'CALL_CLOSED';
  end if;

  select c.* into v_call
    from public.event_artwork_calls c
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());

  if v_call.id is null then
    raise exception 'CALL_CLOSED';
  end if;

  if p_images is null or jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) = 0 then
    raise exception 'IMAGES_REQUIRED';
  end if;
  if jsonb_array_length(p_images) > v_call.max_images then
    raise exception 'TOO_MANY_IMAGES';
  end if;

  insert into public.artwork_submissions (
    tenant_id, call_id, event_id, submitter_name, submitter_email, title, medium, artist_statement
  )
  values (
    v_tenant_id,
    v_call.id,
    v_call.event_id,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_title, '')), ''),
    nullif(btrim(coalesce(p_medium, '')), ''),
    nullif(btrim(coalesce(p_statement, '')), '')
  )
  returning id into v_submission_id;

  v_prefix := '^' || v_tenant_id::text || '/' || v_call.event_id::text || '/' || v_uuid || '/' || v_uuid;

  for v_image in select * from jsonb_array_elements(p_images) loop
    if (v_image ->> 'path') !~ (v_prefix || '\.(jpg|jpeg|png|webp)$') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;
    if (v_image ->> 'thumbPath') !~ (v_prefix || '-thumb\.jpg$') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;
    if (v_image ->> 'contentType') not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;

    insert into public.artwork_submission_images (
      tenant_id, submission_id, storage_path, thumb_path, content_type, byte_size, position
    )
    values (
      v_tenant_id,
      v_submission_id,
      v_image ->> 'path',
      v_image ->> 'thumbPath',
      v_image ->> 'contentType',
      nullif(v_image ->> 'byteSize', '')::bigint,
      v_position
    );
    v_position := v_position + 1;
  end loop;

  return v_submission_id;
end;
$$;

grant execute on function public.submit_artwork(text, text, text, text, text, text, jsonb, text, inet) to anon, authenticated;

-- How many are waiting, for the dashboard's attention list. Mirrors
-- count_pending_reimbursement_approvals: permission-gated inside rather than
-- relying on the caller, so a role without the resource sees zero rather than
-- an error.
create or replace function public.count_pending_artwork_submissions()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('artwork_submissions', 'view') then (
      select count(*)::integer
        from public.artwork_submissions
       where tenant_id = public.current_tenant_id()
         and status = 'pending'
    )
    else 0
  end;
$$;

grant execute on function public.count_pending_artwork_submissions() to authenticated;

-- Permissions ------------------------------------------------------------------

insert into public.resources (key, section, label, description, sort_order) values
  ('artwork_submissions', 'Events', 'Artwork submissions', 'Calls for community artwork on an event, and the submissions that come in', 35);

-- Every tenant's roles, not just the template's: roles are per tenant since
-- Phase 2 and the join by name reaches all of them.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'artwork_submissions', 'manage'),
  ('event_coordinator', 'artwork_submissions', 'manage')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- Audit -------------------------------------------------------------------------

-- The calls and the review decisions are worth keeping. The submitter's address
-- and their prose are not: copying them into an append-only table that no
-- retention policy sweeps is what 20260905160000 moved gear-request notes away
-- from.
insert into public.audited_tables (table_name, redacted_columns) values
  ('event_artwork_calls', '{}'),
  ('artwork_submissions', array['submitter_email', 'artist_statement']);

create trigger audit_log_row after insert or update or delete on public.event_artwork_calls
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.artwork_submissions
  for each row execute function public.audit_log_row();

-- Retention ----------------------------------------------------------------------

-- Ships in dry_run like every other policy (20260905090000): the nightly job
-- logs real counts without deleting until a human moves it to enforce.
insert into public.retention_policies (policy_key, label, period, mode, description) values (
  'artwork_submissions',
  'Artwork submissions',
  interval '3 years',
  'dry_run',
  'Community artwork submissions and their stored images, counted from the submission date. Long by design: a piece may be reprinted or credited in a later issue, and the artist''s consent was given for the zine, not for a year.'
);

-- Self-check, the same one 20260906130000 runs: none of the three new tables
-- may have opened an isolation gap.
do $$
declare
  v_gaps text;
begin
  select string_agg(p.tablename || '."' || p.policyname || '"', ', ') into v_gaps
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('event_artwork_calls', 'artwork_submissions', 'artwork_submission_images')
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id';
  if v_gaps is not null then
    raise exception 'Artwork policies without a tenant predicate: %', v_gaps;
  end if;
end $$;
