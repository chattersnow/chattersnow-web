-- #1331: the Learn disclaimer becomes a content slot, and the two tenants that
-- have an opinion about it get their rows.
--
-- `EducationalDisclaimer` hardcoded one organization's notice -- equipment
-- setup, an injury, a certified technician, an instructor -- under the Learn
-- pages of every tenant on the platform. That was invisible while one tenant
-- published articles; #1331 gives the platform's own marketing site a Learn
-- section whose articles are a security page and an FAQ, and a ski technician
-- underneath them is wrong in a way a reader notices.
--
-- The code side adds `learn.disclaimer`, whose registry default is about advice
-- rather than about equipment, and renders nothing at all when a tenant clears
-- it. This migration writes the two rows the registry cannot:
--
--   * Chatter Snow keeps the exact sentence its Learn pages have been showing.
--     Without this row it would silently adopt the new generic default, which
--     is a change to a live page nobody asked for.
--   * The platform tenant clears it. Its Learn section is two articles that
--     each carry their own closing note, and a third notice above them saying
--     the articles are not advice is noise on a page whose subject is how
--     seriously the platform takes this.
--
-- `where slug = 'chatter-snow'` is the documented pattern for the first
-- tenant's own copy (docs/tenants.md, "Local development: one tenant"): on the
-- hosted project it finds that tenant, and on a fresh local or CI database it
-- correctly finds nothing. The platform tenant is found the way its siblings
-- 20260920020000 through 20260920040000 find it, since its slug is not written
-- down in this repository.
--
-- Triggers off for the same reason as those siblings: there is no session in a
-- migration.

do $$
declare
  v_tenant_id uuid;
  v_count int;
begin
  alter table public.site_content
    disable trigger set_updated_at,
    disable trigger audit_log_row;

  insert into public.site_content (tenant_id, key, value, published_at)
  select
    id,
    'learn.disclaimer',
    to_jsonb('These articles are informational starting points, not personalized advice, instruction, or a certification program. For anything involving safety, equipment setup, or an injury, check with a qualified professional — a certified technician, instructor, or medical provider.'::text),
    now()
  from public.tenants
  where slug = 'chatter-snow'
  on conflict (tenant_id, key) do nothing;

  select count(*) into v_count
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  if v_count = 1 then
    select id into v_tenant_id
    from public.tenants
    where plan = 'internal' and custom_domain is not null;

    insert into public.site_content (tenant_id, key, value, published_at)
    values (v_tenant_id, 'learn.disclaimer', to_jsonb(''::text), now())
    on conflict (tenant_id, key) do nothing;
  elsif v_count = 0 then
    raise notice
      '[#1331] no platform tenant with a custom_domain; leaving the Learn disclaimer at its default';
  else
    -- Deliberately a notice rather than the exception 20260920030000 raises.
    -- That one was about to write one organization's prices onto another's
    -- site; this one would only fail to clear a notice, and a deployment with
    -- two internal tenants should not be stopped by it.
    raise notice
      '[#1331] % tenants are on the internal plan with a custom_domain; not clearing any Learn disclaimer',
      v_count;
  end if;

  alter table public.site_content
    enable trigger set_updated_at,
    enable trigger audit_log_row;
end $$;
