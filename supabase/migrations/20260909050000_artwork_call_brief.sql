-- #876: the public call page states its terms before it asks for the work.
--
-- The page shipped in #870 renders an eyebrow, the event name, the date and an
-- optional `intro`, then goes straight into a file picker. `intro` is nullable,
-- so a call whose curator left it empty asks an artist to hand over original
-- work for print while saying nothing about when it is due or what happens to
-- it. Two changes here, both feeding a brief block above the form.

-- Rights and credit -----------------------------------------------------------

-- Deliberately its own column rather than more prose inside `intro`. The brief
-- is scanned, not read: a curator writing "we print it, you keep it, you are
-- credited as you asked" wants that on its own line under its own heading, and
-- burying it in a paragraph is how it stops being seen. `intro` keeps the
-- editorial half -- the theme, what kind of work is wanted -- and the dialog's
-- helper text moves the credit sentence over here to match.
alter table public.event_artwork_calls
  add column rights_note text;

comment on column public.event_artwork_calls.rights_note is
  'One line on what the organization may do with a submitted piece and how the artist is credited (#876). Null renders nothing rather than a placeholder: inventing rights language on a curator''s behalf is worse than staying quiet about it.';

-- What the public page can see ------------------------------------------------

-- Three columns the page needs and could not reach:
--
--   closes_at        The deadline. It has been on the table since #870 and the
--                    portal lists it, but the page could not render it, so a
--                    call announced nothing about having a deadline and then
--                    404'd the day after it passed.
--   rights_note      Above.
--   event_timezone   `starts_at` and `closes_at` were being formatted with
--                    toLocaleDateString() in a Server Component, which resolves
--                    against the *server's* zone, not the reader's. A deadline
--                    is a hard cutoff and cannot be off by a day. Every other
--                    public surface that prints an event instant already passes
--                    the event's own zone through formatDateTimeInZone()
--                    (events/event-card.tsx, the community calendar); this lets
--                    the artwork page do the same.
--
-- Named event_timezone rather than timezone: an OUT column called `timezone`
-- shadows the GUC of that name inside the body, and there is no reason to find
-- out how well that resolves.
--
-- CREATE OR REPLACE cannot widen a function's OUT columns, so this is a drop
-- and a recreate. Everything else -- the rate limit, the tenant resolution, the
-- window predicate, the empty result for an unknown, unopened or closed code --
-- is carried over from 20260909040000 unchanged.
drop function if exists public.get_artwork_call(text, inet);

create function public.get_artwork_call(
  p_code text,
  p_ip_address inet default null
)
returns table (
  call_id uuid,
  event_id uuid,
  event_name text,
  starts_at timestamptz,
  event_timezone text,
  location text,
  intro text,
  rights_note text,
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

  return query
  select c.id, c.event_id, e.name, e.starts_at, e.timezone, e.location,
         c.intro, c.rights_note, c.closes_at, c.max_images
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
