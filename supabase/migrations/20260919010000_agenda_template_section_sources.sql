-- #1240: a board agenda's standing sections can name a data source.
--
-- Version 1 of the `board_meeting` template gives every section the same pair
-- of free-text boxes, so a board is asked to retype what the Events and
-- Calendar modules already hold. This inserts a **version 2** in which three
-- sections carry a `source`, and repoints the template at it. A section's
-- `source` is read by the agenda tab: sourced means one Discussion box
-- instead of Updates/Decisions needed, with the module's own rows above it
-- (#1241/#1242/#1243 add those rows; this migration only makes the sections
-- say where they come from).
--
-- `agenda_template_versions` has no update or delete policy by design
-- (20260826010000): revising a template is always a new row. That matters
-- more here than usual -- every saved agenda is pinned to a
-- `template_version_id`, so version 1 must stay exactly as written or every
-- agenda already in the book changes shape retroactively. Nothing below
-- touches a version 1 row.
--
-- `agenda_templates` is tenant-scoped (20260906020000), and provision_tenant()
-- copies every version of every template from the template tenant, so this
-- runs per tenant: each tenant that has a `board_meeting` template at version
-- 1 gets its own version 2, including the `internal`-plan template tenant that
-- new tenants are provisioned from.
--
-- Two tenants are deliberately skipped:
--
--  * one whose `board_meeting` template has already been revised past version
--    1. Its version 2 is somebody's own edit, and what "add a source to the
--    Events section" means on top of an unknown revision is a guess. Those
--    tenants keep what they have; an operator can revise them by hand.
--  * one with no `board_meeting` template at all -- a tenant that deleted it.
--
-- A tenant that renamed its template keeps the name: nothing here writes
-- `agenda_templates.name`, following the rule 20260912120000 set out.
--
-- Idempotent: the insert is guarded by `not exists` on version 2 and the
-- update only moves `current_version_id` to the row this migration inserted,
-- so a second run is a no-op.
--
-- The category keys named below are `calendar_categories.key` values seeded by
-- 20260908080000. A key a tenant has deactivated is skipped when the feed is
-- built, not an error -- see the app-side `agendaSectionSource`.

do $$
declare
  t record;
  v1_sections jsonb;
  v2_sections jsonb;
  new_version_id uuid;
  sources jsonb := '{
    "events": {"kind": "events"},
    "community_partnerships": {
      "kind": "calendar",
      "categories": ["partner_opportunities", "community_social_justice", "lgbtq_community"],
      "item_types": ["partner_event", "partner_opportunity"]
    },
    "marketing_social": {
      "kind": "calendar",
      "categories": ["campaigns_fundraising"],
      "item_types": ["content_campaign", "content_opportunity", "community_observance",
                     "heritage_social_justice_moment", "winter_outdoor_sports_moment"]
    }
  }'::jsonb;
begin
  for t in
    select tpl.id as template_id, tpl.tenant_id, v1.sections as sections
    from public.agenda_templates tpl
    join public.agenda_template_versions v1
      on v1.template_id = tpl.id and v1.version = 1
    where tpl.key = 'board_meeting'
      -- Skip a tenant already past version 1, and make the insert idempotent
      -- in the same predicate.
      and not exists (
        select 1 from public.agenda_template_versions v
        where v.template_id = tpl.id and v.version > 1
      )
  loop
    v1_sections := t.sections;

    -- Rebuild the array in place, attaching a source to the three sections
    -- named above and leaving every other section byte-identical. `with
    -- ordinality` preserves the order a tenant may have reordered the
    -- sections into.
    select jsonb_agg(s.value order by s.ord)
    into v2_sections
    from (
      select
        case
          when sources ? (e.value->>'key')
            then e.value || jsonb_build_object('source', sources -> (e.value->>'key'))
          else e.value
        end as value,
        e.ord
      from jsonb_array_elements(v1_sections) with ordinality as e(value, ord)
    ) s;

    insert into public.agenda_template_versions (tenant_id, template_id, version, sections)
    values (t.tenant_id, t.template_id, 2, coalesce(v2_sections, v1_sections))
    returning id into new_version_id;

    update public.agenda_templates
    set current_version_id = new_version_id
    where id = t.template_id;
  end loop;
end $$;
