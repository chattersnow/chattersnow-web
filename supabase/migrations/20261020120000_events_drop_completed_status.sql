-- #1609: an event's "is it over?" is read off its dates, not stored.
--
-- `completed` was a status someone had to set by hand after an event, nothing
-- set it automatically, and setting it took the event off the public site --
-- public_events and the registration RPCs only admit `status = 'published'`.
-- So the lifecycle drops it: a finished event stays `published`, the portal
-- shows a derived Upcoming / Today / Past badge, and the after-event work is
-- what `report_status` already tracks. Cancelled events stay hidden, so
-- public_events is unchanged.
--
-- Three things follow:
--   1. existing `completed` rows become `published` (and so reappear on the
--      public events page, under Past -- intended);
--   2. the registration RPCs close once an event is over. They only checked
--      `registration_deadline`, so a past event with no deadline would have
--      reopened for sign-ups the moment it came back on the public site;
--   3. seed_demo_tenant() stops writing `completed`, or the nightly demo reset
--      would fail the tightened check.
--
-- (2) and (3) patch the live function definitions in place rather than
-- restating them: each is a few hundred lines, and the one-line change is the
-- whole of the diff. Each replacement must match exactly once, or the
-- migration fails rather than silently leaving a function unpatched.

-- 1. Data and constraint ------------------------------------------------------

update public.events set status = 'published' where status = 'completed';

alter table public.events drop constraint events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'published', 'cancelled', 'archived'));

-- 2 and 3. Function patches ----------------------------------------------------

do $patch$
declare
  v_patch record;
  v_def text;
  v_count int;
begin
  for v_patch in
    select *
    from (values
      (
        'public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb)',
        'if v_event.registration_deadline is not null and v_event.registration_deadline < now() then',
        'if (v_event.registration_deadline is not null and v_event.registration_deadline < now())
     or exists (select 1 from public.events e where e.id = p_event_id and coalesce(e.ends_at, e.starts_at) < now()) then'
      ),
      (
        'public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb)',
        'if v_event.registration_deadline is not null and v_event.registration_deadline < now() then',
        'if (v_event.registration_deadline is not null and v_event.registration_deadline < now())
     or exists (select 1 from public.events e where e.id = p_event_id and coalesce(e.ends_at, e.starts_at) < now()) then'
      ),
      (
        'public.seed_demo_tenant(uuid, uuid, uuid)',
        '''public'', ''completed'',',
        '''public'', ''published'','
      )
    ) as patches(signature, find, replace_with)
  loop
    v_def := pg_get_functiondef(v_patch.signature::regprocedure);
    v_count := (length(v_def) - length(replace(v_def, v_patch.find, ''))) / length(v_patch.find);
    if v_count <> 1 then
      raise exception '#1609: expected one match in %, found %', v_patch.signature, v_count;
    end if;
    execute replace(v_def, v_patch.find, v_patch.replace_with);
  end loop;
end
$patch$;
