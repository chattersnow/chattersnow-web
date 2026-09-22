-- #1389: the giving path -- where a tenant's online gift is actually made.
--
-- Split out of #42 with #1390. #42 bundled two jobs: Chatter Snow's own
-- decision (which processor, which fiscal sponsor, what its tax-deductibility
-- copy may truthfully say -- #1320 group F) and the platform surface that
-- decision plugs into. This is the second half, and nothing gates it: it
-- renders nothing until a tenant configures it, so it lands while every
-- tenant's answer is still open.
--
-- A LINK, NOT A PROCESSOR. Every candidate a tenant might pick -- Zeffy,
-- Givebutter, Donorbox, a Stripe Payment Link, PayPal, Every.org, a fiscal
-- sponsor's own page -- hosts the giving form itself and hands out a URL.
-- Pointing at that URL takes no API key, no webhook, no PCI surface and no
-- funds through Coven, and it is the only model that works for all of them.
-- The organization is the merchant of record in every case; Coven never holds
-- donor funds, which is what keeps money transmission, PCI and 1099 exposure
-- off the platform entity. A tenant that later wants live reconciliation gets
-- it from the processor's CSV (#1390). There is deliberately no enum of
-- vendors: `giving.provider_label` is free text and renders only as "opens on
-- {label}", because a list of processors the platform blesses is a
-- recommendation it is in no position to make.
--
-- SEVEN SETTINGS, following `gear_requests.*` (#1032) exactly -- the same
-- nested-key shape in `app_settings`, the same pair of definer RPCs, the same
-- enumerated public view, and the same rule that money is never platform
-- vocabulary (`src/lib/giving.ts` states it at the top, as
-- `src/lib/gear-requests.ts` does).
--
-- WHY finance:manage RATHER THAN system_settings:manage. Identical to the call
-- set_gear_request_settings() made: these keys shape exactly one feature, so
-- the panel lives with that feature (docs/portal-navigation.md) and the gate is
-- the feature's own permission, enforced in the RPC rather than by widening
-- app_settings' select policy to yet another resource.
--
-- VALIDATION LIVES HERE, not only in the panel. `giving.url` is published onto
-- a public page, so a raw PostgREST write must not be able to put a
-- `javascript:` URL there. The checks below mirror `givingUrlError()` in
-- src/lib/giving.ts deliberately -- https only, a host with a dot in it, no
-- embedded credentials, a length cap -- and src/lib/giving.test.ts is what
-- keeps the two honest.

-- ---------------------------------------------------------------------------
-- 1. What the public site may read
-- ---------------------------------------------------------------------------

-- Enumerated keys rather than a `giving.%` prefix, on purpose: #888 records
-- that a prefix-matching public view makes every future row under that prefix
-- world-readable the moment it exists. This view names the seven it serves,
-- so an eighth `giving.*` key is private until a migration says otherwise.
--
-- Every value but `enabled` is withheld while giving is off. A URL a tenant is
-- still drafting is not a secret, but it is not published either, and the
-- public site has no use for it -- so "off" reads as off rather than as a
-- configuration anyone can fetch ahead of the announcement.
create or replace view public.public_giving_settings as
with setting as (
  select s.key, s.value
    from public.app_settings s
   where s.tenant_id = public.public_tenant_id()
     and s.key = any (array[
       'giving.enabled',
       'giving.provider_label',
       'giving.url',
       'giving.mode',
       'giving.suggested_amounts',
       'giving.amount_param',
       'giving.recurring_available'
     ])
),
gate as (
  select coalesce(
           (select value from setting
             where key = 'giving.enabled' and jsonb_typeof(value) = 'boolean'),
           'false'::jsonb
         ) = to_jsonb(true) as enabled
),
published as (
  select key,
         case when (select enabled from gate) then value else null end as value
    from setting
)
select 'enabled'::text as slot,
       to_jsonb((select enabled from gate)) as value
union all
select 'provider_label',
       coalesce((select value from published
                  where key = 'giving.provider_label'
                    and jsonb_typeof(value) = 'string'), '""'::jsonb)
union all
select 'url',
       coalesce((select value from published
                  where key = 'giving.url'
                    and jsonb_typeof(value) = 'string'), '""'::jsonb)
union all
select 'mode',
       coalesce((select value from published
                  where key = 'giving.mode'
                    and jsonb_typeof(value) = 'string'), '"link"'::jsonb)
union all
select 'suggested_amounts',
       coalesce((select value from published
                  where key = 'giving.suggested_amounts'
                    and jsonb_typeof(value) = 'array'), '[]'::jsonb)
union all
select 'amount_param',
       coalesce((select value from published
                  where key = 'giving.amount_param'
                    and jsonb_typeof(value) = 'string'), '""'::jsonb)
union all
select 'recurring_available',
       coalesce((select value from published
                  where key = 'giving.recurring_available'
                    and jsonb_typeof(value) = 'boolean'), 'false'::jsonb);

comment on view public.public_giving_settings is
  'What the public Give card and the /support/donate redirect need of the resolved tenant''s giving.* settings (#1389): whether giving is on, where it points, how it opens, and the amounts to offer. Security definer by design (#887): app_settings has no anon policy. Isolation is tenant_id = public_tenant_id() in the single scan the view makes; every value but `enabled` is null while giving is off.';

alter view public.public_giving_settings set (security_barrier = true);

grant select on public.public_giving_settings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The settings, for the portal
-- ---------------------------------------------------------------------------

create function public.get_giving_settings()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('finance', 'view') then
      jsonb_build_object(
        'enabled', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'giving.enabled'
              and jsonb_typeof(s.value) = 'boolean'),
          'false'::jsonb),
        'provider_label', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'giving.provider_label'
              and jsonb_typeof(s.value) = 'string'),
          '""'::jsonb),
        'url', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'giving.url'
              and jsonb_typeof(s.value) = 'string'),
          '""'::jsonb),
        'mode', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'giving.mode'
              and jsonb_typeof(s.value) = 'string'),
          '"link"'::jsonb),
        'suggested_amounts', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'giving.suggested_amounts'
              and jsonb_typeof(s.value) = 'array'),
          '[]'::jsonb),
        'amount_param', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'giving.amount_param'
              and jsonb_typeof(s.value) = 'string'),
          '""'::jsonb),
        'recurring_available', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'giving.recurring_available'
              and jsonb_typeof(s.value) = 'boolean'),
          'false'::jsonb)
      )
    else null
  end;
$$;

comment on function public.get_giving_settings() is
  'The current tenant''s giving.* settings for the Donations page panel (#1389), or null without finance:view.';

revoke execute on function public.get_giving_settings() from public, anon;
grant execute on function public.get_giving_settings() to authenticated;

create function public.set_giving_settings(
  p_enabled boolean,
  p_provider_label text,
  p_url text,
  p_mode text,
  p_suggested_amounts jsonb,
  p_amount_param text,
  p_recurring_available boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_url text := btrim(coalesce(p_url, ''));
  v_label text := btrim(coalesce(p_provider_label, ''));
  v_param text := btrim(coalesce(p_amount_param, ''));
  v_authority text;
  v_host text;
  v_amount jsonb;
  v_amounts int := 0;
begin
  if not public.has_permission('finance', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  if length(v_label) > 60 then
    raise exception 'PROVIDER_LABEL_TOO_LONG';
  end if;

  if p_mode is null or p_mode not in ('link', 'embed') then
    raise exception 'GIVING_MODE_INVALID';
  end if;

  -- The URL. Mirrors givingUrlError() in src/lib/giving.ts: an empty address
  -- is allowed (it is how a tenant clears the setting) but cannot be published,
  -- which is the check immediately after.
  if v_url <> '' then
    if length(v_url) > 500 then
      raise exception 'GIVING_URL_TOO_LONG';
    end if;
    if v_url !~ '^https://[^[:space:]]+$' then
      raise exception 'GIVING_URL_INVALID';
    end if;
    -- Authority = everything between the scheme and the first /, ? or #.
    v_authority := split_part(
      split_part(split_part(substring(v_url from 9), '/', 1), '?', 1), '#', 1);
    -- No `https://user:pass@host/`: it reads as the host and resolves
    -- elsewhere, and nothing legitimate needs it.
    if position('@' in v_authority) > 0 then
      raise exception 'GIVING_URL_INVALID';
    end if;
    v_host := split_part(v_authority, ':', 1);
    if v_host = '' or position('.' in v_host) = 0 or v_host like '%.' then
      raise exception 'GIVING_URL_INVALID';
    end if;
  elsif coalesce(p_enabled, false) then
    raise exception 'GIVING_URL_REQUIRED';
  end if;

  -- The amounts: whole currency units, positive, capped in count and in size.
  if p_suggested_amounts is null or jsonb_typeof(p_suggested_amounts) <> 'array' then
    raise exception 'GIVING_AMOUNTS_INVALID';
  end if;
  for v_amount in select * from jsonb_array_elements(p_suggested_amounts)
  loop
    if jsonb_typeof(v_amount) <> 'number' then
      raise exception 'GIVING_AMOUNTS_INVALID';
    end if;
    if (v_amount)::numeric <> trunc((v_amount)::numeric)
       or (v_amount)::numeric <= 0
       or (v_amount)::numeric > 100000 then
      raise exception 'GIVING_AMOUNTS_INVALID';
    end if;
    v_amounts := v_amounts + 1;
  end loop;
  if v_amounts > 6 then
    raise exception 'GIVING_AMOUNTS_INVALID';
  end if;

  -- The provider's own query-string name for the amount, so it only has to be
  -- safe on the left of an `=`. Blank is the ordinary case: a provider that
  -- takes no amount parameter gets a plain link, not a broken one.
  if v_param <> '' and v_param !~ '^[A-Za-z0-9_][A-Za-z0-9_.\[\]-]{0,39}$' then
    raise exception 'GIVING_AMOUNT_PARAM_INVALID';
  end if;

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values
    (v_tenant_id, 'giving.enabled', to_jsonb(coalesce(p_enabled, false)), auth.uid()),
    (v_tenant_id, 'giving.provider_label', to_jsonb(v_label), auth.uid()),
    (v_tenant_id, 'giving.url', to_jsonb(v_url), auth.uid()),
    (v_tenant_id, 'giving.mode', to_jsonb(p_mode), auth.uid()),
    (v_tenant_id, 'giving.suggested_amounts', p_suggested_amounts, auth.uid()),
    (v_tenant_id, 'giving.amount_param', to_jsonb(v_param), auth.uid()),
    (v_tenant_id, 'giving.recurring_available', to_jsonb(coalesce(p_recurring_available, false)), auth.uid())
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_giving_settings(boolean, text, text, text, jsonb, text, boolean) is
  'Writes the current tenant''s seven giving.* settings (#1389). Gated on finance:manage rather than system_settings:manage, because the panel lives with the feature. Re-validates the URL here as well as in the panel: this value is published onto a public page.';

revoke execute on function public.set_giving_settings(boolean, text, text, text, jsonb, text, boolean) from public, anon;
grant execute on function public.set_giving_settings(boolean, text, text, text, jsonb, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Chatter Snow's own copy for the three new slots
-- ---------------------------------------------------------------------------

-- The platform defaults for `support.giving_title` and `support.giving_body`
-- describe what a gift does; `support.giving_tax_note` ships empty, because
-- what a gift is worth at tax time is the one sentence only the organization
-- can write (docs/legal-basis.md rule 1).
--
-- Chatter Snow's answer is not a new commitment and not a board decision
-- waiting in #1320: it is already published, in this tenant's own terms of use
-- and privacy policy (seeded by 20260909020000), which say in as many words
-- that Chatter Snow is unincorporated, is not a registered 501(c)(3), and that
-- contributions are therefore not tax-deductible. Restating a published policy
-- at the point where somebody is about to give is a factual statement rather
-- than an invented one -- the same call 20260922060000 and 20260922090000
-- made. Nothing here names a processor or a fiscal sponsor, because that is
-- exactly what #1320 group F has not decided; Chatter Snow's `giving.*`
-- settings stay unset, so its Donations page is unchanged until somebody turns
-- giving on in Finance > Donations.
--
-- Scoped by slug so the demo and platform tenants inherit nothing, which also
-- makes this a no-op on a fresh local or CI database (it bootstraps as
-- `example-nonprofit`, see docs/tenants.md) -- leaving CI exercising the
-- platform defaults, the state every other tenant is in.
--
-- `on conflict do nothing`, because a row somebody has already written from
-- Website > Pages is newer than anything a migration knows. Triggers off for
-- the write for the reason 20260922060000 gives: `set_updated_at` would stamp
-- the row with a null actor and `audit_log_row` would record a change no
-- person made. `stamp_site_content_authorship` stays on -- it is what moves
-- `published_at`.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('support.giving_title', '"Give"'),
  ('support.giving_body', '"Every gift goes straight into what we run: lift tickets and lessons for people who could not otherwise get on the mountain, gear for the library, and the buses that get everyone there. We are volunteers — nobody here draws a salary."'),
  ('support.giving_tax_note', '"Chatter Snow is an unincorporated community organization and is not a registered 501(c)(3) charity, so gifts to us are not tax-deductible charitable donations. We will update this the moment that changes."')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
