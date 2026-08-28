-- Seeds the first-year starter template library (issue #107 scope, per
-- planning/ideas/content_community_calendar.md §7). Each template's v1
-- fields are inserted the same two-step way the app does it (template row ->
-- version row -> back-fill current_version_id), using a plain PL/pgSQL block
-- per template rather than a single WITH-chained statement: data-modifying
-- CTEs share one snapshot with the statement's primary query, so a final
-- UPDATE targeting the same table an earlier CTE just inserted into can't
-- see that row and silently updates zero rows. Sequential statements inside
-- a DO block don't have that problem.
--
-- The "Awareness or community moment" field list intentionally omits
-- "Chatter connection" and "Recommended action" from the source list --
-- content_opportunities already has dedicated columns for both (issue #106),
-- so the template only adds fields that aren't already covered.

do $$
declare
  new_template_id uuid;
  new_version_id uuid;
begin
  insert into public.content_brief_templates (key, name, description)
  values (
    'community_spotlight',
    'Community spotlight',
    'Spotlight a person or group in the Chatter community.'
  )
  returning id into new_template_id;

  insert into public.content_brief_template_versions (template_id, version, fields)
  values (
    new_template_id,
    1,
    '[
      {"key": "subject_name", "label": "Person or group", "help_text": null},
      {"key": "community_identity", "label": "Community / identity", "help_text": "Only include with the subject''s explicit consent and appropriate context -- never assume or infer identity."},
      {"key": "photo_asset", "label": "Photo / asset", "help_text": "Link or reference to the photo or asset to use."},
      {"key": "quote", "label": "Quote", "help_text": null},
      {"key": "setting", "label": "Mountain / outdoor setting", "help_text": null},
      {"key": "favorite_activity", "label": "Favorite winter/outdoor activity", "help_text": null},
      {"key": "why_chatter_matters", "label": "Why Chatter matters to them", "help_text": null},
      {"key": "publish_permission", "label": "Permission to publish + usage limits", "help_text": "Confirm consent to publish and note any usage limits (e.g. social only, no last names)."}
    ]'::jsonb
  )
  returning id into new_version_id;

  update public.content_brief_templates
  set current_version_id = new_version_id
  where id = new_template_id;
end $$;

do $$
declare
  new_template_id uuid;
  new_version_id uuid;
begin
  insert into public.content_brief_templates (key, name, description)
  values (
    'awareness_moment',
    'Awareness or community moment',
    'Acknowledge an observance or community moment with a Chatter-relevant post.'
  )
  returning id into new_template_id;

  insert into public.content_brief_template_versions (template_id, version, fields)
  values (
    new_template_id,
    1,
    '[
      {"key": "observance", "label": "Observance", "help_text": null},
      {"key": "why_it_matters", "label": "Why it matters", "help_text": null},
      {"key": "resources", "label": "Resources", "help_text": null},
      {"key": "public_asset", "label": "Public graphic / asset", "help_text": null},
      {"key": "caption_copy", "label": "Caption / copy draft", "help_text": null},
      {"key": "cta", "label": "CTA", "help_text": null},
      {"key": "review_notes", "label": "Review notes", "help_text": null}
    ]'::jsonb
  )
  returning id into new_version_id;

  update public.content_brief_templates
  set current_version_id = new_version_id
  where id = new_template_id;
end $$;

do $$
declare
  new_template_id uuid;
  new_version_id uuid;
begin
  insert into public.content_brief_templates (key, name, description)
  values (
    'partner_spotlight',
    'Partner spotlight',
    'Feature a partner organization and the relationship with Chatter.'
  )
  returning id into new_template_id;

  insert into public.content_brief_template_versions (template_id, version, fields)
  values (
    new_template_id,
    1,
    '[
      {"key": "organization", "label": "Organization", "help_text": null},
      {"key": "partner_type", "label": "Partner type", "help_text": null},
      {"key": "logo_asset", "label": "Logo / asset", "help_text": null},
      {"key": "description", "label": "Description", "help_text": null},
      {"key": "website_social", "label": "Website / social handles", "help_text": null},
      {"key": "relationship_owner", "label": "Relationship owner", "help_text": null},
      {"key": "last_feature_date", "label": "Last feature date", "help_text": null},
      {"key": "next_opportunity", "label": "Next opportunity", "help_text": null},
      {"key": "approval_usage_notes", "label": "Approval / usage notes", "help_text": null}
    ]'::jsonb
  )
  returning id into new_version_id;

  update public.content_brief_templates
  set current_version_id = new_version_id
  where id = new_template_id;
end $$;
