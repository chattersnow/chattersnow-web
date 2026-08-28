-- Issue #73: manual tracking of discount codes issued by a partner/vendor
-- for an event, and which registrant each was given to. Redemption happens
-- outside chattersnow-web (a partner's ticketing page, a vendor, etc.) -
-- no payment/pricing integration. Automatic assignment at registration time
-- is explicitly out of scope (needs board input, tracked separately).

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  description text,
  source text,
  registration_id uuid references public.event_registrations(id) on delete set null,
  assigned_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  -- Single-use: a code can be assigned to at most one registrant. Each
  -- non-null registration_id can appear in at most one code row, so a
  -- registrant can't be double-assigned the same code slot; a registrant
  -- receiving multiple distinct codes is still allowed.
  constraint discount_codes_unique_registration unique (registration_id)
);

-- A table-level unique constraint can't take a function expression like
-- lower(code), so this needs a unique index instead - same pattern as
-- event_registrations_event_email_key (20260823090000).
create unique index discount_codes_unique_code
  on public.discount_codes (event_id, lower(code));

create trigger set_updated_at before update on public.discount_codes
  for each row execute function public.set_updated_at();

alter table public.discount_codes enable row level security;

create policy "discount_codes select" on public.discount_codes for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "discount_codes insert" on public.discount_codes for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "discount_codes update" on public.discount_codes for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "discount_codes delete" on public.discount_codes for delete to authenticated
  using (public.has_permission('events', 'manage'));

grant select, insert, update, delete on public.discount_codes to authenticated;
