-- #1331: the Coven site's security-and-data page and its FAQ, as Learn
-- articles in the platform tenant's own rows.
--
-- The third sibling of 20260920020000 and 20260920030000, and the same
-- argument: the words are data, so they are portal-editable and need no
-- deploy, and an editor's later change wins because everything below is
-- `on conflict do nothing`.
--
-- ## Why Learn rather than two routes
--
-- #998 asks for a *Security & data* page and a *Docs / FAQ*. Both are prose --
-- properties, questions, answers, a few links -- which is exactly what an
-- article has been since #894, and articles are already tenant data. Two gated
-- routes would have put two pages of prose into Core for no capability the
-- article model does not already have, and spent two of the handful of
-- Coven-only routes that #1325 set as the exit criterion for splitting the
-- marketing site out of this codebase. `ArticleBody` renders paragraphs, a
-- labelled list, links and a disclaimer; a labelled list is the right shape for
-- a list of security properties, and there are no tables to lose.
--
-- The copy is written to the order `LearnArticleSections` actually renders --
-- description, then the labelled list, then the paragraphs, then the links --
-- so the paragraphs read as the note after the properties rather than as an
-- introduction to them.
--
-- ## Every claim below was checked against the code
--
-- An inaccurate security page is worse than none, so each property names
-- something that exists rather than something that reassures, and says where it
-- stops:
--
--   * Isolation -- `tenant_isolation_gaps()` (20260906100000) reads pg_catalog
--     for policies and foreign keys that have slipped out of the rule, and
--     `src/lib/portal/tenant-isolation.integration.test.ts` asserts the list is
--     empty on every run. That is what "a test checks it" means here.
--   * Permissions -- the `resources`/`role_permissions` matrix, read by
--     `has_permission()` in RLS and by `requirePermission` in the route guards
--     (docs/spec/access-control.md §5.3).
--   * The audit trail -- `audit_log` (20260822120000 and the extensions after
--     it) is trigger-fed and has no insert policy for anyone. It is *not* every
--     table, so the article lists the ones it covers rather than implying the
--     lot.
--   * Export -- `export_current_tenant_data()`, self-service at Administration
--     > Organization Settings > Data, and the honest part named in
--     docs/tenants.md ("Storage"): it carries photo URLs, not photo bytes.
--   * Deletion -- archive then `delete_tenant()`, which refuses a tenant that
--     is not archived; `auth.users` is untouched because an account is
--     platform-wide (docs/tenants.md, "Deletion").
--   * Where it runs -- the Supabase project is in `us-east-2` (Ohio) and the
--     deployments answer with `x-vercel-id: iad1` (Washington, D.C.). Named,
--     rather than gestured at.
--   * Backups -- docs/backups.md: nightly, age-encrypted before leaving the
--     runner, ninety days on R2. The ninety days is stated as what it is, a
--     window in which deleted data still exists somewhere.
--
-- ## Turning `learn` on is the only Core-side item
--
-- `page_visibility.learn` is `defaultVisible: false` because a tenant with no
-- articles would otherwise carry a nav entry to an empty section (#894). This
-- tenant now has two, so the switch goes on for it and for nobody else -- which
-- is also what puts Learn in the footer, since the footer renders
-- `visibleGroups()` like the header does.
--
-- ## The audience pages get two buttons, not a third copy of the prose
--
-- `audience_nonprofits.ctas` and `audience_business.ctas` already exist from
-- 20260920020000, so `on conflict do nothing` would not reach them; they are
-- appended to instead, guarded on the destination not already being there so a
-- re-run cannot double a button. An append is the editor-safe shape: it keeps
-- whatever the row holds and adds to the end, and anybody who disagrees deletes
-- the row in Administration > Site Content.
--
-- Triggers off, per 20260908000000 and 20260912050000: there is no session in a
-- migration, so `set_updated_at` would stamp a null actor and `audit_log_row`
-- would write actorless entries into the tenant's audit log.
-- `stamp_article_authorship` stays on -- it already coalesces a missing
-- `auth.uid()`, and it is what publishes the rows by setting `published_at`.

do $$
declare
  v_tenant_id uuid;
  v_category_id uuid;
  v_count int;
  v_security_href text := '/learn/answers#security-and-data';
  v_questions_href text := '/learn/answers#questions';
begin
  -- Scoped by plan and by having a domain at all, exactly as its two siblings
  -- are: slugs are `service_role`-only and this deployment's platform slug is
  -- not written down in the repository. The bootstrap tenant
  -- 20260905190000_seed_initial_tenant.sql creates is also `internal` and has
  -- no `custom_domain`, which is what keeps local development and CI out of
  -- this.
  select count(*) into v_count
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  if v_count = 0 then
    raise notice
      '[#1331] no platform tenant with a custom_domain; skipping the Learn articles';
    return;
  end if;

  if v_count > 1 then
    raise exception
      '[#1331] % tenants are on the internal plan with a custom_domain; this migration cannot tell which one owns the product marketing site. Put the customer tenants on their real plan, or name the platform slug here.',
      v_count;
  end if;

  select id into v_tenant_id
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  alter table public.article_categories disable trigger audit_log_row;
  alter table public.articles disable trigger audit_log_row;

  -- One category holding both articles rather than one each. /learn/<slug>
  -- renders every article in the category on a single page with its own
  -- in-page nav, so one link reaches both and a reader who came for the
  -- security properties meets the ownership answer on the way past.
  insert into public.article_categories (tenant_id, slug, position, value)
  values (
    v_tenant_id,
    'answers',
    0,
    $json${"title": "Answers",
           "description": "How the platform holds your organization's records, and the questions people ask before they move onto it."}$json$::jsonb
  )
  on conflict (tenant_id, slug) do nothing;

  select id into v_category_id
  from public.article_categories
  where tenant_id = v_tenant_id and slug = 'answers';

  insert into public.articles (tenant_id, category_id, anchor, position, value)
  values
    (v_tenant_id, v_category_id, 'security-and-data', 0,
     $json${
       "title": "Security and your data",
       "description": "Where your organization's records live, who can reach them, and how you get them back.",
       "paragraphs": [
         "Each of those is a property of the system rather than a promise about it. One database serves every organization, and the first question a board or an owner asks is how one organization's records stay out of another's: they are separated by Postgres itself rather than by the application remembering to ask the right question, which is why a query that fails to name the organization it is asking about returns nothing at all rather than somebody else's records.",
         "Where something is narrower than it sounds, it says so above. A page that reassures is worth less than one that can be checked, so ask about any line here and we will show you the part of the system that does it."
       ],
       "list": [
         {
           "label": "Separation is enforced in the database",
           "text": "Every table that belongs to an organization carries it, and so does every foreign key between two of them, so a record cannot be attached to a parent in another organization. A check reads the database's own catalog for any policy or key that has slipped out of that rule, and the test suite asserts on every run that it finds none."
         },
         {
           "label": "Permissions are a grid you control",
           "text": "Access is a grid of your roles against the parts of the system: nothing, view, or manage. Your administrators edit it in the portal, and both the database policies and the portal's route guards read that same grid, so a section nobody is entitled to is neither shown in the sidebar nor reachable by typing its address. A change takes effect immediately, without waiting on a release."
         },
         {
           "label": "An audit trail that survives the record",
           "text": "Donations, inventory and its movements, event expenses, role changes, calendar items, content opportunities, retention rules and organization settings are recorded as they are written: who, when, and the row before and after. The recording is done by the database itself rather than by the code paths doing the writing, so no write path can forget, and nothing in the application can insert into that trail or edit it. It does not yet cover every table in the system, and those are the ones it covers."
         },
         {
           "label": "The public website cannot read the private tables",
           "text": "Your public pages are served by a small set of read-only views that expose published content for one organization and nothing else. Donor, financial, inventory and audit tables are not among them, and no view carries write access of any kind."
         },
         {
           "label": "Export, whenever you want it, without asking",
           "text": "An administrator downloads the whole organization from Administration > Organization Settings > Data: one JSON document with every row of every table that belongs to you, your members and their email addresses, and your audit trail. The table list is generated from the system's own catalog, so a feature added next year is in the export without anyone remembering to add it. One limit is worth knowing before you need it: the export carries image URLs rather than image bytes. Those links resolve without a login, so fetch your own photos while you have the export in hand."
         },
         {
           "label": "Deletion, and what deletion does not reach",
           "text": "Ask for your organization to be removed and it comes off its domains first, which is reversible, and is deleted after, which is not: every row of every table, then the audit trail, then the organization itself. Take an export first. Sign-in accounts are not part of it, because an account is platform-wide and the person may belong to another organization, so those are removed separately on request."
         },
         {
           "label": "Where it runs, and for how long",
           "text": "The application runs on Vercel in Washington, D.C. and the database is Postgres hosted by Supabase in Ohio. A backup is taken nightly, encrypted before it leaves the machine that makes it, and held in Cloudflare object storage for ninety days. That last number has a consequence worth stating plainly: something you delete can survive in an encrypted backup for up to ninety days after it is gone from the system."
         }
       ],
       "links": [
         {"label": "Questions we get asked", "href": "/learn/answers#questions", "internal": true},
         {"label": "Try the demo", "href": "https://demo.rickiecruz.com"}
       ],
       "disclaimer": "This describes how the platform is built today, not a contract, and it changes as the system does. What is promised in writing is in the agreement you sign; where the two differ, the agreement is the one that binds."
     }$json$::jsonb),
    (v_tenant_id, v_category_id, 'questions', 1,
     $json${
       "title": "Questions we get asked",
       "description": "Getting what you already have into it, who owns it once it is there, and what happens if you leave.",
       "paragraphs": [
         "The first three arrive in every conversation, usually in that order; the rest arrive once somebody has decided they are interested. This page is edited in the portal like the rest of the site, so it changes when an answer changes rather than at the next release."
       ],
       "list": [
         {
           "label": "How do we get what we already have into it?",
           "text": "Most organizations arrive with spreadsheets, a shared drive, a donation form and a booking tool. Bringing those in is part of setting you up rather than a project you run on your own: your people, inventory, donations and events are mapped onto fields the system already has, and you look at the result before anybody else does. Inside the portal, the content calendar is the one thing with a spreadsheet importer of its own today; everything else is brought in at setup or typed as you go."
         },
         {
           "label": "Who owns the data?",
           "text": "You do. Every row in every table belongs to the organization it is about -- your records, your documents, the words on your public pages, your branding -- and the platform's code and design stay with the platform. That boundary is written down rather than implied, and the export exists so that owning your records is something you can act on at any hour rather than something you are told. None of it is sold, mined, or used to build anything for another organization."
         },
         {
           "label": "What happens if we leave?",
           "text": "You export, we delete, in that order. The export is the whole organization in one file and you can take it before you have decided anything. Deletion takes the site off its domains first and is reversible up to that point; the removal after it is not. Fetch your images from the URLs in the export while you are at it, because the file holds the links rather than the pictures."
         },
         {
           "label": "Can we use our own domain?",
           "text": "Yes, and it is included rather than an upgrade: your public website and your staff portal both answer on your own name. Which organization a request belongs to is resolved from the domain it arrived on, so moving to a new one is a setting rather than a rebuild."
         },
         {
           "label": "Does somebody need a second account for the public site?",
           "text": "No. One person is one account across both: whoever signs in to run the organization is already signed in on its public website, and someone who signed up from the public side has no staff access until somebody grants it. What differs between the two is what you are allowed to do, not who you are."
         },
         {
           "label": "Is this a nonprofit product?",
           "text": "It is one product, and what it calls things is a setting. The same screens read donors or customers, volunteers or staff, programs or services, whichever is yours. The only part that is genuinely nonprofit-shaped is governance -- a board, its meetings, minutes and resolutions -- and a business simply leaves it switched off."
         },
         {
           "label": "What happens if you disappear?",
           "text": "You still have the export, and it is a plain JSON document rather than a format only this system reads. That is the honest answer a small vendor can give, and it is the reason the export is self-service and not a support ticket."
         }
       ],
       "links": [
         {"label": "Security and your data", "href": "/learn/answers#security-and-data", "internal": true},
         {"label": "What it does", "href": "/modules", "internal": true},
         {"label": "What it costs", "href": "/pricing", "internal": true},
         {"label": "Try the demo", "href": "https://demo.rickiecruz.com"}
       ],
       "disclaimer": "If your question is not here, ask it. The answer that comes back is the one that ends up on this page."
     }$json$::jsonb)
  on conflict (tenant_id, category_id, anchor) do nothing;

  alter table public.article_categories enable trigger audit_log_row;
  alter table public.articles enable trigger audit_log_row;

  -- Learn, on for this tenant and this tenant only. The section now has
  -- something behind it, which is the condition #894 wrote the default for.
  insert into public.app_settings (tenant_id, key, value)
  values (v_tenant_id, 'page_visibility.learn', to_jsonb(true))
  on conflict (tenant_id, key) do nothing;

  alter table public.site_content
    disable trigger set_updated_at,
    disable trigger audit_log_row;

  -- The line under the Learn heading. The registry default is written for an
  -- organization publishing guides; this section is two articles about the
  -- product, so it says so.
  insert into public.site_content (tenant_id, key, value, published_at)
  values (
    v_tenant_id,
    'learn.intro',
    to_jsonb('How the platform holds what you put into it, and the answers to what people ask before they move onto it.'::text),
    now()
  )
  on conflict (tenant_id, key) do nothing;

  -- The two audience pages, appended to rather than replaced. The `shown` flag
  -- is written explicitly: a row without one reads as shown, and a button on a
  -- marketing page should not depend on that allowance.

  update public.site_content
  set value = value || jsonb_build_array(
        jsonb_build_object('label', 'How your data is handled',
                           'href', v_security_href, 'shown', true),
        jsonb_build_object('label', 'Questions we get asked',
                           'href', v_questions_href, 'shown', true))
  where tenant_id = v_tenant_id
    and key in ('audience_nonprofits.ctas', 'audience_business.ctas')
    and jsonb_typeof(value) = 'array'
    and not value @> jsonb_build_array(jsonb_build_object('href', v_security_href));

  alter table public.site_content
    enable trigger set_updated_at,
    enable trigger audit_log_row;
end $$;
