-- Seeds the standard Chatter Snow board meeting agenda template (issue
-- #166), following the same two-step insert pattern as
-- 20260824105000_seed_content_brief_templates.sql (template row -> version
-- row -> back-fill current_version_id).

do $$
declare
  new_template_id uuid;
  new_version_id uuid;
begin
  insert into public.agenda_templates (key, name, description)
  values (
    'board_meeting',
    'Chatter Snow board meeting agenda',
    'Standard board meeting agenda covering ongoing board items, decisions, and action items.'
  )
  returning id into new_template_id;

  insert into public.agenda_template_versions (template_id, version, sections)
  values (
    new_template_id,
    1,
    '[
      {"key": "finance_fundraising", "label": "Finance & Fundraising", "topics": [
        "Current financial position", "Recent income and expenses", "Upcoming expenses",
        "Donations and fundraising", "Sponsorship opportunities", "Banking / financial administration"]},
      {"key": "legal_nonprofit", "label": "Legal & Nonprofit", "topics": [
        "Fiscal sponsorship", "501(c)(3) status / application", "Bylaws and governance",
        "Insurance", "Compliance requirements", "Board/officer responsibilities"]},
      {"key": "events", "label": "Events", "topics": [
        "Upcoming events", "Event planning status", "Budget", "Volunteers / staffing",
        "Vendors and venues", "Outstanding logistics", "Post-event follow-up"]},
      {"key": "community_partnerships", "label": "Community & Partnerships", "topics": [
        "New partnerships", "Sponsor relationships", "Community outreach",
        "Ski/snowboard organizations", "LGBTQ+ community organizations", "Gear and accessibility initiatives"]},
      {"key": "marketing_social", "label": "Marketing & Social", "topics": [
        "Upcoming campaigns", "Social media calendar", "Important LGBTQ+ dates",
        "Winter/snow-sport dates", "Event promotion", "Community stories / content"]},
      {"key": "operations", "label": "Operations", "topics": [
        "Inventory", "Internal processes", "Documentation",
        "Volunteer coordination", "Shared resources", "Administrative tasks"]},
      {"key": "technology_website", "label": "Technology & Website", "topics": [
        "Website", "Internal systems", "Domains/accounts",
        "Security/access", "New technology needs"]}
    ]'::jsonb
  )
  returning id into new_version_id;

  update public.agenda_templates
  set current_version_id = new_version_id
  where id = new_template_id;
end $$;
