-- #795 rollout step 3: Chatter Snow stops renting its identity from the
-- platform's defaults and owns it in its own rows.
--
-- Everything Phase 3 is about to genericize -- the slot defaults in
-- src/lib/site-content.ts, the palette in globals.css, DEFAULT_LOGO -- is
-- currently what renders on chattersnow.org, because Chatter Snow has never set
-- any of it.
-- Each Phase 3 checkbox therefore removes copy from a live site rather than
-- from a template, which is why the ticket puts this migration first: with
-- these rows in place, changing a default is invisible to the tenant that used
-- to depend on it, and every other Phase 3 change becomes safe in any order.
--
-- The values below are the registry defaults *exactly as they stand today*, so
-- this migration is a no-op to look at: the public site must render the same
-- before and after. That is the whole test of it, and it was run -- the
-- rendered text of all fourteen public pages is identical with these rows in
-- place and without them. They were generated from SITE_CONTENT_SLOTS rather
-- than retyped, so no slot is silently reworded on the way into the database.
--
-- Scoped by slug, not by `default_tenant_id()`: the demo and platform tenants
-- must not inherit a nonprofit's copy, and on an environment with no
-- `chatter-snow` tenant the CTE matches nothing and the whole migration is a
-- no-op. `on conflict do nothing` because a slot someone has already written
-- from Administration > Site Content is newer than a default, always.
--
-- What is deliberately NOT here:
--
--   * The three legal documents (`legal.privacy`, `legal.terms`,
--     `legal.code_of_conduct`). Their defaults are `null` -- the pages render a
--     hardcoded React document instead -- so seeding them means converting JSX
--     into structured content AND deciding that the platform's boilerplate is
--     Chatter Snow's published terms. The second half is a decision for the
--     board, not a migration, so the pages keep rendering their built-in
--     documents until someone publishes deliberately.
--   * The image slots. #812 already moved Chatter Snow's 25 `site_images.*`
--     rows out of app_settings and into site_content, so those are owned.
--   * The branding (`brand.*`). It was written, measured and pulled back out,
--     because seeding it does not render identically -- it breaks dark mode.
--     `brandingCss()` emits the tenant's light palette as `:root { ... }`,
--     which has the same specificity as globals.css's `.dark { ... }` and comes
--     later in the document, so `--background` resolves to the light
--     `#f7f0ff` on a dark page: measured `rgb(247, 240, 255)` with the rows
--     against `lab(2.75% 0 0)` without them. Separately, the dark values it
--     derives are approximations of hand-picked ones -- `--purple-deep`, the
--     body text colour in dark mode, comes out `rgb(188, 179, 201)` where the
--     stylesheet says `rgb(226, 208, 246)`. Both belong to `brandingCss()`,
--     not to Chatter Snow, and any tenant setting the Page background token
--     from Administration > System Settings > Branding hits the first one
--     today. Filed separately; the palette follows once it is fixed.
--   * SECURITY_EMAIL from src/lib/contact-addresses.ts, which has no slot: it
--     is published at /.well-known/security.txt rather than on a page. The
--     other three addresses there are `org.email_*` slots and are seeded below.

-- Triggers off for the write, the same reasoning as
-- 20260908000000_site_content_drafts.sql: `set_updated_at` would stamp rows
-- with a null actor, and `audit_log_row` would write ~90 audit entries for a
-- change no person made. `stamp_site_content_authorship` stays on -- it is what
-- fills `published_by`, and `published_at` is passed explicitly.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

-- Site content: every text, paragraphs and list slot. Image slots are already
-- owned (#812) and the three document slots are deliberately left unset. -------
with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('org.short_name', '"Chatter"'),
  ('org.tagline', '"Chatter Snow is a queer ski and snowboard community bringing LGBTQ+ skiers and snowboarders together on and off the East Coast mountains."'),
  ('org.image_alt', '"Chatter Snow community members"'),
  ('org.email_general', '"info@chattersnow.org"'),
  ('org.email_privacy', '"privacy@chattersnow.org"'),
  ('org.email_conduct', '"conduct@chattersnow.org"'),
  ('org.instagram_handle', '"chattersnow"'),
  ('org.footer_contact_eyebrow', '"Get in touch"'),
  ('home.heading', '"A queer ski & snowboard community"'),
  ('home.intro', '"Chatter brings LGBTQ+ skiers and snowboarders together on and off the East Coast mountains, and works to make snow sports more accessible through gear, mentorship, and community."'),
  ('home.cta_events', '"Join an event"'),
  ('home.cta_get_involved', '"Get involved"'),
  ('home.cta_donate', '"Donate"'),
  ('home.next_event_eyebrow', '"Next up"'),
  ('about_story.heading', '"About Chatter"'),
  ('about_story.intro', '["Chatter is a queer ski and snowboard community on the East Coast that brings LGBTQ+ riders together both on and off the mountain. What started as a small group of friends has grown into a community hosting indoor and mountain meetups, collaborating with other organizations, and creating opportunities for queer skiers and snowboarders to get involved regardless of experience or budget.","At its core, Chatter is about making snow sports more accessible and building community around them. That means more than just organizing group rides. Chatter provides gear through donations and drives, facilitates gear swaps, connects newer riders with on-snow mentorship, and works with mountains and partners to make events more affordable."]'),
  ('about_story.section_heading', '"Our Story"'),
  ('about_story.body', '["Chatter started three summers ago when a group of friends wanted to create a space where queer skiers and snowboarders could find each other, ride together, and feel like they belonged on the mountain.","Since then, that idea has grown into an East Coast community. We''ve brought people together through indoor snow sessions, mountain meetups, park days, collaborations, and events with partner organizations. Our community is largely centered around the NYC area, but we''re continuing to grow our reach across the East Coast.","As we''ve grown, we''ve realized that simply creating opportunities to ride together isn''t enough. Snow sports can be expensive and intimidating to get into, especially for someone who doesn''t already have the equipment, knowledge, or community around them.","That''s where Chatter''s bigger purpose comes in.","We''re working to make skiing and snowboarding more accessible to LGBTQ+ people by helping remove some of the financial and social barriers that keep people off the mountain. Through gear donations and swaps, beginner mentorship, affordable group events, and partnerships with mountains and other organizations, we''re building a community where people can get into snow sports, improve their skills, and find people to ride with."]'),
  ('about_mission.heading', '"Our Mission"'),
  ('about_mission.statement', '"Bringing together LGBTQ+ boarders and skiers on and off the mountain. Creating inclusive safe spaces for everyone on the East Coast."'),
  ('about_mission.lead_in', '"We believe snow sports should be something people can participate in regardless of their experience, background, or budget. Chatter works to make that possible by:"'),
  ('about_mission.points', '[{"text":"Building community through inclusive ski and snowboard events"},{"text":"Improving access through gear donations, drives, and swaps"},{"text":"Supporting new riders through mentorship and on-snow guidance"},{"text":"Making riding more affordable through mountain and community partnerships"},{"text":"Creating connection both on the mountain and beyond it"}]'),
  ('about_mission.closing', '"We''re not just creating a place to ride. We''re building a community that makes it easier for queer people to get there in the first place."'),
  ('about_mission.values_heading', '"Our Values"'),
  ('about_mission.values', '[{"name":"Inclusion","description":"Every rider is welcome regardless of experience, background, or budget."},{"name":"Access","description":"We work to remove the financial and social barriers that keep people off the mountain."},{"name":"Community","description":"We''re building relationships that last beyond a single event or season."},{"name":"Mentorship","description":"Experienced riders show up for newer ones so no one has to figure it out alone."}]'),
  ('about_mission.why_heading', '"Why LGBTQ+ snow sports"'),
  ('about_mission.why_body', '["Ski towns and mountain culture haven''t always felt welcoming to queer and trans people, and the cost of entry, gear, lift tickets, lessons, travel can make snow sports feel out of reach before someone even gets to the mountain.","A dedicated LGBTQ+ space changes that. It gives people a lower-pressure way to try skiing or snowboarding for the first time, surrounded by others who understand what it''s like to walk into a lodge or a lift line without knowing if they''ll be accepted. It also means there''s a community to come back to season after season, not just a single event."]'),
  ('about_team.heading', '"Meet the team"'),
  ('about_team.members', '[{"name":"Cass Lainez","photo_url":"","photo_slot":"about_team_photo_cass","bio":[]},{"name":"Rickie Cruz","photo_url":"","photo_slot":"about_team_photo_rickie","bio":["Hi, I’m Rickie—a skier, software engineer, and one of Chatter’s token skiers, as Sofie likes to say. ⛷️","Chatter and I have grown alongside each other. We both got serious about the sport and the LGBTQ+ ski and snowboard community around the same time. When Chatter held its first event, I had no gear of my own and knew very few queer people in the ski and snowboard community. By the end of that event, I had made connections and friendships that helped me become a better skier—and somehow walked away with a brand-new Burton jacket.","I got involved with Chatter in late 2025, initially helping with social media and eventually supporting event planning. Today, I focus on building the technology and operational infrastructure behind Chatter—from our website and internal systems to an operations portal that helps us stay organized, manage our programs, and scale as the organization grows.","For me, Chatter is about more than just getting on the mountain. It’s about the people you meet, the friendships you make, and finding a community that makes you want to keep showing up—on and off the mountain.","And yes, I’m still one of the token skiers… for now. 🏳️‍🌈⛷️"]},{"name":"Sofie Chavez","photo_url":"","photo_slot":"about_team_photo_sofie","bio":["I''m Sofie, but most friends call me Sof. I''ve been in the snowboarding world for 5 years and riding for 4. Learning to ride as an adult has been hard work that I enjoy every second of. I fell in love quickly when I linked my first turns at Big Snow, my home mountain/mall.","Chatter was born from my frustration with the homophobia I kept seeing on many mountain pride posts, and the homophobic slurs I''d heard on hill. So in 2024 with the help of my friends and Park Affair, we brought the idea to life. The goal was simple: bring together the queer community and ease the barrier of entry.","When I''m not putting on Chatter events you can usually find me volunteering on snow with Hoods to Wood, We''re All Mental, and Black Boarders of CT. Or helping coach beginner park with Park Affair and East Coast Lady Boarders.","When I''m off snow, you can find me playing saxophone, surfing, drawing, rock climbing, playing d&d or reading a comic. And that''s the beauty of Chatter! I''ve made friends on snow that I can share my off snow hobbies with too.","I hope if you''re reading this and you''re not sure what to do or where to start, just show up to an event. I promise you won''t walk away without a new friend and maybe a new to you item!"]}]'),
  ('about_team.bio_placeholder', '"Bio coming soon."'),
  ('events.heading', '"Upcoming & past events"'),
  ('events.intro', '"Browse Chatter Snow events happening on and off the mountain."'),
  ('events.community_heading', '"Community Calendar"'),
  ('events.community_intro', '"Chatter-hosted events are marked as such. Other entries are community observances, seasonal moments, and campaigns Chatter is highlighting — not events Chatter hosts or organizes."'),
  ('programs.heading', '"Programs"'),
  ('programs.intro', '"Get access. Find your people. Learn and progress. Keep riding."'),
  ('programs.pillars', '[{"label":"Access","description":"Get on the mountain."},{"label":"Progression","description":"Find your people, build your skills."},{"label":"Community","description":"Keep riding, keep connecting."}]'),
  ('programs.items', '[{"pillar":"Access","emoji":"🎿","name":"Learn to Ride","description":"Beginner-friendly sessions to make getting started in skiing and snowboarding less intimidating — orientation to gear, lifts, and mountain basics in a welcoming LGBTQ+ group setting."},{"pillar":"Access","emoji":"🧤","name":"Gear Access","description":"We collect and redistribute donated ski and snowboard equipment to help make snow sports more accessible. See what''s currently available on our Gear page."},{"pillar":"Progression","emoji":"🤝","name":"Ride Buddy","description":"Paired for the day with an experienced rider — not formal instruction, just someone to answer questions and ride alongside."},{"pillar":"Progression","emoji":"🏂","name":"Progression & Park Riding","description":"Skill-focused sessions for riders looking to push themselves. From building confidence on the mountain to learning park fundamentals, we create supportive environments to progress alongside other riders."},{"pillar":"Community","emoji":"🏔️","name":"Mountain Meetups","description":"Group days at mountains across the East Coast where the focus is community as much as riding. Chatter provides a central gathering point, organized groups, and opportunities to meet other LGBTQ+ skiers and snowboarders."},{"pillar":"Community","emoji":"🌈","name":"Community Events","description":"Off-snow gatherings that keep the community connected year-round, including Pride events, social meetups, outdoor activities, gear swaps, and collaborations with LGBTQ+ and outdoor organizations."}]'),
  ('learn.heading', '"Learn"'),
  ('learn.intro', '"Snow sports 101 — orientation basics for anyone new to skiing or riding. Looking for equipment size charts specifically? Check the"'),
  ('gears.library_heading', '"Gear library"'),
  ('gears.library_intro', '"Browse gear currently available to the community."'),
  ('gears.donate_heading', '"How the gear program works"'),
  ('gears.donate_intro', '"Chatter collects donated ski and snowboard gear and makes it available to people in the community who need it. Browse the library, add what you need to your cart, and submit one request for everything at once. We''ll help coordinate pickup or drop-off at an upcoming event."'),
  ('gears.request_heading', '"Don''t see what you need?"'),
  ('gears.request_body', '"If your size or item isn''t currently in the library, send us a message and we''ll do our best to match you with available gear."'),
  ('gears.accept_heading', '"Donate gear"'),
  ('gears.accept_title', '"We accept gently used gear"'),
  ('gears.accept_items', '[{"text":"Skis & snowboards"},{"text":"Boots & bindings"},{"text":"Outerwear (jackets, pants)"},{"text":"Gloves & accessories"}]'),
  ('gears.dropoff_body', '"Drop items off in person at any Chatter event, or contact us to arrange a drop-off, mail-in, or collection."'),
  ('gears.drives_heading', '"Gear drives"'),
  ('gears.drives_body', '"We periodically run gear drives and swap events where the community can donate, trade, and pick up gear in person. See"'),
  ('get_involved.heading', '"Get involved"'),
  ('get_involved.intro', '"Chatter runs on people showing up in whatever way works for them — on the mountain, behind the scenes, or by helping us grow."'),
  ('get_involved.sponsor_heading', '"Sponsor Chatter"'),
  ('get_involved.sponsor_body', '"Sponsorships help fund events, gear, and programs."'),
  ('get_involved.gear_heading', '"Donate gear"'),
  ('get_involved.gear_body', '"Have gear you''re not using? Donating it helps another rider get on the mountain. See what we accept on our"'),
  ('get_involved.attend_heading', '"Attend"'),
  ('get_involved.attend_body', '"The easiest way to get involved is to show up. Browse upcoming mountain days and community meetups and come ride with us."'),
  ('get_involved.community_heading', '"Join the community"'),
  ('get_involved.community_body', '"Follow along, meet other members, and hear about events first on Instagram"'),
  ('get_involved.partner_heading', '"Become a partner"'),
  ('get_involved.partner_body', '"We work with mountains, gear brands, and other organizations to make events more affordable and accessible for our community. Partnership can look like a lift ticket discount with a resort, a gear brand supplying demo equipment for an event, a co-hosted meetup with another LGBTQ+ or outdoor organization, or a venue donating space for a gear drive. If your organization wants to collaborate with Chatter in any of these ways, we''d love to hear from you."'),
  ('get_involved.volunteer_heading', '"Volunteer"'),
  ('get_involved.volunteer_intro', '"Chatter runs on volunteers. Here are some of the ways you can get involved."'),
  ('get_involved.volunteer_empty', '"Check back soon for open volunteer roles."'),
  ('support.heading', '"Support Chatter"'),
  ('support.intro', '"Chatter relies on donations, sponsorships, and gear to keep our programs running and accessible."'),
  ('support.donations_card', '"Support Chatter with a monetary or in-kind donation. Learn what we accept and how your contribution helps make snow sports more accessible."'),
  ('support.sponsorship_card', '"Partner with Chatter through cash, in-kind, or combined support for events, mountain days, and access programs."'),
  ('support.donations_heading', '"Donations"'),
  ('support.donations_intro', '"Donations help Chatter keep programs running and make skiing and snowboarding more accessible to LGBTQ+ riders."'),
  ('support.monetary_title', '"Monetary donations"'),
  ('support.monetary_body', '"Online monetary donations are coming soon. Contributions will help fund accessible events, mountain days, and community programs."'),
  ('support.inkind_title', '"In-kind donations"'),
  ('support.inkind_body', '"We accept gently used ski and snowboard gear, which we redistribute through our gear program. See what we accept and how to donate on our"'),
  ('support.sponsorship_heading', '"Sponsorship"'),
  ('support.sponsorship_intro', '"Sponsors help fund the core of what Chatter does: subsidizing mountain days, keeping gear access programs running, and making events more affordable for LGBTQ+ riders who might not otherwise be able to join. In return, sponsors get real visibility with our community — event branding, recognition in event materials and on our website, and a direct line to a rider base that shows up for the brands that show up for them."'),
  ('support.sponsorship_tiers', '[{"name":"Cash sponsorship","description":"Underwrite an event, a season of mountain days, or a program like our gear library. Cash sponsors are the easiest way to keep events affordable and accessible."},{"name":"In-kind sponsorship","description":"Contribute gear, lift tickets, venue space, or services. In-kind support stretches directly into gear drives, event day logistics, and giveaways."},{"name":"Both","description":"Many of our sponsors mix cash and in-kind support across a season. We''ll work with you to find a combination that fits your organization."}]'),
  ('support.sponsorship_cta', '"Talk to us about sponsoring"'),
  ('contact.heading', '"Get in touch"'),
  ('contact.intro', '"Questions, ideas, or want to get involved? Send us a message and we''ll get back to you."')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
