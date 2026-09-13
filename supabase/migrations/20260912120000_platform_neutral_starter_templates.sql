-- #976: the vocabulary a new tenant is *provisioned with* stops naming one
-- client.
--
-- #838 swept `src/**`. What provision_tenant() hands a new tenant does not
-- live in `src/**` -- it lives in rows, copied from the template tenant
-- (`plan = 'internal'`, currently Platform) -- and was never swept. Those
-- rows came from 20260826050000 and 20260824105000, which ran once before
-- tenancy existed into what was then the only tenant, were stamped with a
-- tenant_id by 20260906010000, and have been copied forward verbatim by
-- every provisioning since. So a customer could be handed a portal whose
-- code says nothing about Chatter Snow and whose board agenda is titled
-- "Chatter Snow board meeting agenda".
--
-- The agenda template is the one that stings: a board agenda is read aloud
-- in a meeting and attached to the minutes, so another organization's name
-- would end up inside a customer's governance record.
--
-- Two rules shape every statement below.
--
-- 1. Chatter Snow keeps its own words. `slug = 'chatter-snow'` is excluded
--    throughout, the same way #834 let it keep "Chatter events" as a label
--    while the key became `own_events`. The exclusion is written as a `not
--    exists` rather than `tenant_id <> (select ...)` so that a database with
--    no such tenant -- local, CI, any future deployment -- excludes nothing
--    instead of matching nothing.
--
-- 2. An edited row is that tenant's own words and is left alone. Every
--    predicate matches the *old text*, not the key, so a tenant that has
--    already renamed its board agenda template keeps the name it chose. The
--    cost of that rule is that this migration fixes only tenants provisioned
--    before it; tenants provisioned after inherit the corrected template.
--
-- Deliberately out of scope: the wording in these same seeds that is
-- snow-sports-specific rather than Chatter-named ("Mountain / outdoor
-- setting", "Ski/snowboard organizations", "Winter/snow-sport dates"). A
-- starter set that is wrong-but-editable is a different problem from a name
-- that is someone else's, and the ticket leaves that decision open.

-- 1. The board agenda template's name.
--
--    `public.agenda_templates` carries `set_updated_at` and no audit trigger,
--    so this bumps updated_at and nothing else -- accurate, since the row did
--    change. `updated_by` stays null: a migration has no actor, and naming
--    one would make the audit trail say something untrue.
update public.agenda_templates t
set name = 'Board meeting agenda'
where t.name = 'Chatter Snow board meeting agenda'
  and not exists (
    select 1 from public.tenants tn
    where tn.id = t.tenant_id and tn.slug = 'chatter-snow'
  );

-- 2. The three content brief template descriptions that name Chatter.
--
--    Each is rewritten to address the reader's own organization, which is
--    what the rest of the starter vocabulary already does and what survives
--    translation to any customer.
update public.content_brief_templates t
set description = 'Spotlight a person or group in your community.'
where t.description = 'Spotlight a person or group in the Chatter community.'
  and not exists (
    select 1 from public.tenants tn
    where tn.id = t.tenant_id and tn.slug = 'chatter-snow'
  );

update public.content_brief_templates t
set description = 'Acknowledge an observance or community moment with a post relevant to your work.'
where t.description = 'Acknowledge an observance or community moment with a Chatter-relevant post.'
  and not exists (
    select 1 from public.tenants tn
    where tn.id = t.tenant_id and tn.slug = 'chatter-snow'
  );

update public.content_brief_templates t
set description = 'Feature a partner organization and your relationship with them.'
where t.description = 'Feature a partner organization and the relationship with Chatter.'
  and not exists (
    select 1 from public.tenants tn
    where tn.id = t.tenant_id and tn.slug = 'chatter-snow'
  );

-- 3. The community spotlight's "Why Chatter matters to them" field label.
--
--    The label only. `why_chatter_matters` is the key a filled-in brief's
--    `content_opportunities.template_field_values` is stored against, so
--    renaming it would orphan every answer already written -- the same care
--    #838 took with `chatter_connection`, which could be renamed precisely
--    because it was a column and `alter ... rename column` moves the data
--    with it. A jsonb key has no such guarantee, and the key is never
--    displayed: the portal renders `label` and looks values up by `key`.
--
--    This mutates a version row in place, which 20260824085000 otherwise
--    treats as immutable ("revising a template's fields always inserts a new
--    version"). That rule exists so a completed brief is never retroactively
--    restructured, and it is the reason an update is right here rather than a
--    v2: a brief pinned to v1 renders v1's labels, so a new version would
--    leave every existing brief still reading "Why Chatter matters to them"
--    while only new briefs were fixed. Nothing about the structure changes --
--    same fields, same order, same keys -- so no brief is restructured and
--    the invariant's purpose is honoured even as its letter is not.
--
--    The array is rebuilt rather than patched by index because the field's
--    position is not guaranteed across tenants that have reordered it; `with
--    ordinality` preserves the order it found.
update public.content_brief_template_versions v
set fields = (
  select jsonb_agg(f.value order by f.ord)
  from (
    select
      case
        when e.value->>'key' = 'why_chatter_matters'
          then jsonb_set(e.value, '{label}', '"Why your organization matters to them"'::jsonb)
        else e.value
      end as value,
      e.ord
    from jsonb_array_elements(v.fields) with ordinality as e(value, ord)
  ) f
)
where v.fields @> '[{"key": "why_chatter_matters", "label": "Why Chatter matters to them"}]'::jsonb
  and not exists (
    select 1 from public.tenants tn
    where tn.id = v.tenant_id and tn.slug = 'chatter-snow'
  );
