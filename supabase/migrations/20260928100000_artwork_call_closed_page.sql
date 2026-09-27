-- #1454: a closed artwork call answers "closed", not 404.
--
-- Until now get_artwork_call returned no rows for anything but an open call,
-- so an artist who opened a flyer's link the day after the deadline got "page
-- not found" and reasonably concluded the link was broken. That uniformity was
-- meant to stop someone guessing codes from telling "wrong" apart from "not
-- open", but a code is ~5.9e17 possibilities (see the comment on
-- generate_artwork_submission_code) and a "closed" answer only confirms a code
-- the caller already holds -- which they got from a flyer or a link.
--
-- The RPC now returns a `status` alongside the call:
--
--   open          the call as it was, every field filled in
--   not_yet_open  is_open, but opens_at is still ahead
--   closed        closes_at has passed, or staff switched is_open off on a call
--                 that has already taken submissions
--
-- and still returns no rows for an unknown code, another tenant's code, or a
-- tenant with the artwork module off (#902) -- an off module must not reveal
-- that a call exists. A call that is switched off and has neither taken a
-- submission nor passed its deadline is treated as a draft that was never
-- published, and also returns no rows: "closed" would announce a call nobody
-- was ever told about.
--
-- For the two non-open states only the title, the zone and the dates leave
-- the database. The intro, rights note and event details are nulled here
-- rather than merely left unrendered, so a closed call's brief is not one view
-- source away.
--
-- Nothing about submitting changes: claim_artwork_upload_slots and
-- submit_artwork keep their own open-window check and raise CALL_CLOSED.

-- The return type grows two columns, which `create or replace` cannot do.
drop function if exists public.get_artwork_call(text, inet);

create function public.get_artwork_call(
  p_code text,
  p_ip_address inet default null
)
returns table (
  call_id uuid,
  status text,
  title text,
  event_id uuid,
  event_name text,
  starts_at timestamptz,
  display_timezone text,
  location text,
  intro text,
  rights_note text,
  opens_at timestamptz,
  closes_at timestamptz,
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

  -- #902. An off module answers with no rows, exactly as an unknown code does.
  if not public.module_enabled_for_tenant(v_tenant_id, 'artwork') then
    return;
  end if;

  return query
  with found as (
    select c.*,
           case
             when c.is_open
                  and (c.opens_at is null or c.opens_at <= now())
                  and (c.closes_at is null or c.closes_at >= now())
               then 'open'
             when c.is_open and c.opens_at > now()
               then 'not_yet_open'
             when c.closes_at < now()
                  or exists (
                    select 1 from public.artwork_submissions s
                     where s.tenant_id = c.tenant_id and s.call_id = c.id
                  )
               then 'closed'
           end as status
      from public.event_artwork_calls c
     where c.tenant_id = v_tenant_id
       and c.submission_code = upper(btrim(coalesce(p_code, '')))
  )
  select f.id, f.status, f.title,
         case when f.status = 'open' then f.event_id end,
         case when f.status = 'open' then e.name end,
         case when f.status = 'open' then e.starts_at end,
         coalesce(f.timezone, e.timezone, 'UTC'),
         case when f.status = 'open' then e.location end,
         case when f.status = 'open' then f.intro end,
         case when f.status = 'open' then f.rights_note end,
         f.opens_at, f.closes_at, f.max_images
    from found f
    left join public.events e
      on e.id = f.event_id and e.tenant_id = f.tenant_id
   where f.status is not null;
end;
$$;

revoke execute on function public.get_artwork_call(text, inet) from public;
grant execute on function public.get_artwork_call(text, inet) to anon, authenticated;

comment on function public.get_artwork_call(text, inet) is
  'The public artwork page''s lookup (#1454). One row with status open, not_yet_open or closed for a published call -- non-open rows carry only the title, zone and dates. No rows for an unknown code, another tenant''s, a never-published draft, or an off artwork module.';

comment on table public.event_artwork_calls is
  'A per-event call for community artwork (#870). submission_code is the entire address of the public upload page -- link-only, never in nav. An unknown code 404s; a closed or not-yet-open one renders its title and dates without the form (#1454).';
