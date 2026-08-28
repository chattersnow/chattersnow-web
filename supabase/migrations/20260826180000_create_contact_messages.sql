-- Public contact intake (issue #172): the contact form was mailto:-only,
-- contradicting spec §9/§5.1 (server-validated, rate-limited, no client-side
-- email client dependency). Persisted here so staff have a queue to work
-- from once the companion ops-inbox ticket lands; this ticket does not send
-- email (see issue #172's action item, which only asks for persistence).
--
-- Same anon-bypass pattern as volunteer_applications/event_registrations:
-- anonymous visitors never get direct table access, only the
-- submit_contact_message() RPC below, which enforces the rate limit and
-- honeypot atomically before inserting.

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

-- No dedicated "contact inbox" resource exists yet -- the companion
-- ops-inbox ticket ("In-portal ops inbox for form submissions, routed by
-- role") is expected to introduce one and route by topic. Until then, gate
-- read access on administration so submissions aren't stranded unreadable.
create policy "contact_messages select" on public.contact_messages for select to authenticated
  using (public.is_admin());

grant select on public.contact_messages to authenticated;

create function public.submit_contact_message(
  p_name text,
  p_email text,
  p_topic text,
  p_message text,
  p_honeypot text default null,
  p_ip_address inet default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
begin
  if not public.check_rate_limit('submit_contact_message', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- Honeypot: a field real users never see or fill; bots that autofill
  -- every input trip it. Report a fake success so probing bots learn
  -- nothing was rejected.
  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_topic is null or btrim(p_topic) = '' then
    raise exception 'TOPIC_REQUIRED';
  end if;
  if p_message is null or btrim(p_message) = '' then
    raise exception 'MESSAGE_REQUIRED';
  end if;

  insert into public.contact_messages (name, email, topic, message)
  values (p_name, p_email, p_topic, p_message)
  returning id into v_message_id;

  return v_message_id;
end;
$$;

grant execute on function public.submit_contact_message to anon, authenticated;
