-- #858: Chatter Snow's legal documents stop being the platform's defaults and
-- become its own tenant's published rows.
--
-- The three pages under /privacy, /terms and /code-of-conduct rendered a
-- hardcoded React document whenever a tenant had published none of its own, and
-- the Site Content editor called that "the platform's document". It was Chatter
-- Snow's: snow-sports risk, a gear library, what happens on the mountain, New
-- Jersey governing law, and @chattersnow.org addresses throughout. Provisioning
-- a tenant published another organization's legal position under that tenant's
-- brand. The platform's default is now genuinely neutral
-- (src/lib/legal-defaults.ts), and what was Chatter Snow's moves here.
--
-- 20260908040000_seed_chatter_snow_identity.sql deliberately left these three
-- slots alone and said why: converting JSX into structured content is one
-- problem, and deciding the platform's boilerplate is Chatter Snow's published
-- terms is a second. Both are settled now -- this *is* Chatter Snow's text,
-- written for Chatter Snow, and the second question was only ever about whether
-- it was anybody else's.
--
-- Nothing is published by this migration. Whether these routes are served is
-- still LEGAL_PAGES_PUBLISHED in src/lib/legal-pages.ts, which is false, so all
-- three 404 today exactly as they did yesterday. A `legal.*` row here means
-- "this is Chatter Snow's text", not "the board has approved it" -- #859 adds
-- the publish state that carries the board's actual position, and must not read
-- the presence of these rows as approval.
--
-- Scoped by slug, not by `default_tenant_id()`, for the same reason as
-- 20260908040000: the demo and platform tenants must not inherit a nonprofit's
-- legal position, and on a fresh local or CI database (which bootstraps as
-- `example-nonprofit`, see docs/tenants.md) the CTE matches nothing and the
-- whole migration is a no-op -- which is what leaves local and CI exercising the
-- neutral default. `on conflict do nothing` because a slot someone has already
-- written from Administration > Site Content is newer than this, always.
--
-- What the conversion changed, and what it did not
-- ------------------------------------------------
-- The words are the words that were on the page. Structure that
-- `LegalDocumentContent` cannot hold was folded, not dropped:
--
--   * The privacy policy's two definition lists (what each form collects, and
--     the retention periods) are bullets led by a bold term.
--   * The code of conduct's "Something happened? Tell us." callout, which was
--     lifted above the first section on purpose, is the third paragraph of the
--     summary -- still the first thing a reader who needs it meets.
--   * Its two sub-headings inside "What isn't tolerated" are bold lines above
--     their lists.
--   * Links and bold are the markdown-lite that src/lib/legal-markup.ts parses.
--
-- The retention bullets were generated from RETENTION_POLICIES rather than
-- retyped, and src/lib/legal-seed.test.ts asserts they are still all present:
-- once this text is a row rather than a render of that module, nothing else
-- stops a period changing in code while this page keeps promising the old one,
-- which is the failure #602 exists to prevent. Changing a period now needs a
-- follow-up migration against these rows.
--
-- Facts about Chatter Snow that the deleted files carried as maintainer notes,
-- and that outlive them
-- ----------------------------------------------------------------------------
--   * "Who we are" says Chatter Snow is unincorporated and not a 501(c)(3).
--     Both were true as of the last-updated date: see
--     planning/decisions/2026-08-22-state-of-incorporation.md, which only
--     *recommends* New Jersey and has not been filed. On the day incorporation
--     completes, revisit the whole terms document rather than one sentence --
--     the entity's legal name, liability position, insurance and charitable
--     status all have to line up, here and in the footer copyright line.
--   * "Donations and payments" says the site takes no money, and the privacy
--     policy makes the same promise. Change both together, and note that
--     contributions are not tax-deductible until the IRS determination letter is
--     in hand.
--   * Governing law names New Jersey. It is the clause most exposed to the
--     incorporation decision, and it does not by itself decide which state's law
--     governs a dispute arising from NY activity.
--   * The gear library gives donated equipment away permanently. It is not a
--     lending program: inventory_movements has 'received' and 'distributed' and
--     no 'returned'. Do not reintroduce return, due-date, or damage-liability
--     language.
--   * The terms deliberately carry no general release of claims. Event waivers,
--     the gear acknowledgement and volunteer agreements each cover their own
--     activity -- see "Other agreements". Keep it that way.
--   * The code of conduct's response commitments ("within 5 days", "when
--     practicable, at least two board members", "within 14 days" to appeal) are
--     promises to the people who report, qualified on 2026-09-02 so the page
--     does not guarantee what a three-person volunteer board cannot always
--     deliver. BOARD RATIFICATION PENDING on the qualified wording; see
--     planning/decisions/2026-09-02-public-legal-pages.md. They are absent from
--     the platform's default on purpose -- a number no other board has agreed to
--     is the same hazard as borrowed terms.
--   * conduct@chattersnow.org is a distribution list reaching every board
--     member, not a mailbox anyone can be excluded from, which is why "Reporting
--     a problem" says so outright. Do not soften that back into "it goes to the
--     board": a reader reporting a board member will assume that means the
--     person will not see it, and they will.

-- Triggers off for the write, the same reasoning as 20260908040000:
-- `set_updated_at` would stamp rows with a null actor, and `audit_log_row` would
-- write audit entries for a change no person made. `stamp_site_content_authorship`
-- stays on -- it is what fills `published_by`, and `published_at` is passed
-- explicitly.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('legal.privacy', $doc${
  "title": "Privacy Policy",
  "last_updated": "September 5, 2026",
  "summary": [
    "Chatter Snow is an LGBTQ+ ski and snowboard community organization on the East Coast. This policy explains what personal information we collect through this website, why we collect it, who can see it, how long we keep it, and how to ask us for a copy or a deletion.",
    "The short version: we try to collect only the information we need to run our events, programs, and gear library and to keep in touch with you, we don't sell or rent it to anyone, and you can ask us to delete it — apart from the few records we're legally required to keep — by emailing [privacy@chattersnow.org](mailto:privacy@chattersnow.org)."
  ],
  "sections": [
    {
      "id": "what-we-collect",
      "title": "What we collect, and why",
      "paragraphs": [
        "Everything below is information you type into a form yourself. We don't buy personal information about you from anyone else.",
        "- **[Contact form](/contact)** — Your name, email address, the topic you pick, and your message. So we can read what you sent and reply to you.\n- **[Volunteer application](/get-involved/volunteer)** — Your name, email address, and — if you choose to give them — your phone number, the roles you're interested in, and your availability. To review your application, follow up about volunteering, and let you check your application status with the reference code we give you.\n- **[Event registration](/events)** — Your name, email address, party size, and — optionally — your phone number, Instagram handle, and any notes you add. If you fill in a rider profile, we also store whether you ski or snowboard, your experience level, and your preferred mountain. To hold your spot, plan the event around who's coming, send you event details, and match the day to the experience levels showing up.\n- **[Gear requests](/gears/library)** — Your name, email address, and — optionally — your phone number and any notes about what you need. To match you with the gear you asked for and arrange a time to hand it over.\n- **Portal accounts** — For board members and volunteer leads only: the email address you sign in with, and a session cookie that keeps you signed in. Signing in with Google shares your Google account's email address and name with us. To sign you in to the operations portal and apply the permissions attached to your role.",
        "We also record the IP address a form submission came from and store it with that submission. It is used only to stop spam and abuse — to limit how many times the same sender can submit a form in a short window — and it is deleted when the submission it belongs to is deleted.",
        "We are an LGBTQ+ organization, and you never have to tell us anything about your sexual orientation or gender identity to take part. None of our forms ask for it, and nothing about your participation is published by us. The rider details we do ask for — whether you ski or snowboard, your experience level, your preferred mountain — are there to plan the day around the group that's coming, nothing else."
      ]
    },
    {
      "id": "what-we-dont-do",
      "title": "What we don't do",
      "paragraphs": [
        "- We don't sell, rent, or trade your personal information, and we don't share it with advertisers.\n- We don't use advertising or cross-site tracking cookies on this site.\n- We don't take payments or store card details on this site. Online monetary donations aren't open yet; when they are, this policy will be updated before they go live.\n- We don't publish your information. Names and photos only appear on the public site when someone has agreed to that separately, such as a board member on our [team page](/about/team)."
      ]
    },
    {
      "id": "how-long-we-keep-it",
      "title": "How long we keep it",
      "paragraphs": [
        "We keep personal information only for as long as we reasonably need it for the purposes described here. When we no longer need it, we delete it, or we strip the personal details and keep only the count — how many people came to an event, how many first-time riders — which tells us nothing about you.",
        "- **Contact form messages** — 2 years from the date you sent them.\n- **Volunteer applications** — 2 years after your last activity with us, or 1 year if the application is withdrawn or declined.\n- **Event registrations** — 3 years after the event.\n- **Rider profiles** — Until you ask us to delete your profile, or after 2 years of inactivity.\n- **Gear requests** — 3 years after we hand the gear over.\n- **Portal accounts** — For as long as you hold the role. When your role ends we permanently disable your access and clear the personal details we hold about you in the portal. We keep the record of what was done through the portal — including which account did it — for governance, security, audit, insurance, and legal reasons.",
        "These periods are enforced by a scheduled job, not by hand: it runs nightly and removes or anonymizes whatever has passed its date, and keeps a record of what it did so we can check the policy is being applied.",
        "Some records have to outlive those periods because the law or our own accounting requires it — donation and financial records we need for our reporting and tax filings, for example. A few organizational records, such as tax filings, financial statements, and governance records, we keep permanently. If you ask us to delete your information and something falls into one of those categories, we'll tell you what we have to keep and why."
      ]
    },
    {
      "id": "who-can-see-it",
      "title": "Who can see it",
      "paragraphs": [
        "Inside Chatter, what you submit is visible to the board members and volunteer leads whose role covers it — the people running events see event registrations, the volunteer coordinator sees volunteer applications, and so on. Access is enforced in the database by the permissions attached to each role, not just hidden in the interface.",
        "Running an event means the volunteers staffing it may need to see who registered — a check-in list, a head count, who asked for gear or noted something we should know about on the day. We don't publish participant lists, and we don't give your name or contact details to a mountain, a partner, or a sponsor unless you have agreed to that separately, or the venue requires it to let the group in and we've told you so when you registered.",
        "Outside Chatter, we rely on a small number of service providers to run the site. They handle information on our behalf, under their own terms and privacy policies:",
        "- **Supabase** — hosts our database and handles portal sign-in.\n- **Vercel** — hosts this website and provides the aggregate traffic counts we use to see which pages get visited.\n- **Google** — only if you choose to sign in to the portal with a Google account.",
        "We'll also share information if we're legally required to, or if it's necessary to protect someone's safety."
      ]
    },
    {
      "id": "how-we-protect-it",
      "title": "How we protect it",
      "paragraphs": [
        "We use reasonable administrative, technical, and organizational safeguards to protect what you give us: information travels to the site over an encrypted connection, portal accounts are individual rather than shared, and access to each kind of record is limited to the roles that need it and enforced by the database itself.",
        "No website or database is perfectly secure, and we can't promise otherwise. If a breach ever affects your information, we'll tell you and the authorities we're required to tell, as promptly as we can."
      ]
    },
    {
      "id": "cookies-and-analytics",
      "title": "Cookies and analytics",
      "paragraphs": [
        "The public site sets no cookies of its own. The one cookie we do set is the session cookie that keeps board members and volunteer leads signed in to the operations portal, and it's only set once someone signs in.",
        "We use Vercel Web Analytics to count page views. It reports visits in aggregate, sets no cookies and stores nothing on your device, and doesn't follow you across other websites. We don't run Google Analytics or any advertising analytics on this site."
      ]
    },
    {
      "id": "other-sites",
      "title": "Other sites we link to",
      "paragraphs": [
        "We link out to mountains, partner organizations, sponsors, and our social accounts. Once you follow one of those links you're on someone else's site, and what they collect is covered by their privacy policy, not this one — worth a read before you hand them anything. The same goes for the ticketing or payment services we may use in the future; if we add one, we'll name it here first."
      ]
    },
    {
      "id": "your-choices",
      "title": "Your choices",
      "paragraphs": [
        "Email [privacy@chattersnow.org](mailto:privacy@chattersnow.org) and you can ask us to:",
        "- send you a copy of what we hold about you,\n- correct anything that's wrong,\n- delete your information, subject to the records we're required to keep, and\n- stop emailing you about events, programs, or volunteering.",
        "We aim to respond within 30 days. So that we don't hand your information to someone else, please write from the email address you gave us, or be ready to confirm the details of the submission you're asking about."
      ]
    },
    {
      "id": "minors",
      "title": "Minors",
      "paragraphs": [
        "This site isn't directed at children under 13, and we don't knowingly collect their personal information through it. Where a program is open to riders under 18, we ask a parent or guardian to complete the forms. If you believe a child has given us information through this site, email us and we'll delete it."
      ]
    },
    {
      "id": "changes",
      "title": "Changes to this policy",
      "paragraphs": [
        "If we start collecting something new or using it differently, we'll update this page and change the date at the top. For a change that materially affects information you've already given us, we'll say so directly rather than relying on you to re-read the page."
      ]
    },
    {
      "id": "contact",
      "title": "Contact",
      "paragraphs": [
        "Questions about this policy, or about anything we hold on you, go to [privacy@chattersnow.org](mailto:privacy@chattersnow.org). You can also reach us through the [contact form](/contact)."
      ]
    }
  ]
}$doc$),
  ('legal.terms', $doc${
  "title": "Terms of Use",
  "last_updated": "September 2, 2026",
  "summary": [
    "These terms cover this website and the things you can do through it — reading about us, signing up for an event, applying to volunteer, asking for gear, and getting in touch. By using the site you're agreeing to them. If you don't agree, please don't use the site.",
    "The short version: we're volunteers, not a company. Signing up here is a request, not a confirmed spot. Skiing and snowboarding carry real risk and you take it on yourself. Gear from our library is free and yours to keep, and we give it to you exactly as it reached us — we don't check it. We're not a registered charity yet, so contributions aren't tax-deductible.",
    "How we handle the information you give us is covered separately, in our [privacy policy](/privacy)."
  ],
  "sections": [
    {
      "id": "who-we-are",
      "title": "Who we are",
      "paragraphs": [
        "Chatter Snow is an LGBTQ+ ski and snowboard community organization on the East Coast, run by volunteers. We are currently an unincorporated community organization: we have not completed incorporation, and we are not a registered 501(c)(3) tax-exempt charity.",
        "That means contributions to Chatter Snow are not tax-deductible charitable donations, and nothing on this site should be read as claiming otherwise. We'll update this page when our legal status or our tax-exempt status changes — they are two separate things and they won't necessarily happen at the same time.",
        "Where these terms refer to our board, organizers, or volunteers, that describes how we govern and run ourselves, not a corporation that exists today."
      ]
    },
    {
      "id": "using-this-site",
      "title": "Using this site",
      "paragraphs": [
        "Use the site for its intended purpose, and please don't:",
        "- submit someone else's personal information, or sign someone up for something without their say-so,\n- submit deliberately false information on a form, including a fake name or an email address that isn't yours,\n- send harassing, threatening, hateful, or discriminatory content through any form on this site,\n- try to get into parts of the site you haven't been given access to, including the operations portal, or interfere with how the site runs for anyone else, or\n- scrape, bulk-download, or automatically submit to the site. We rate-limit form submissions to keep spam out.",
        "We may decline or remove a submission, or turn down a request to participate, if it breaks these terms."
      ]
    },
    {
      "id": "events-and-programs",
      "title": "Events and programs",
      "paragraphs": [
        "Registering through this site is a request for a spot, not a confirmed one. Spots are limited, and we'll confirm by email. Event details — dates, times, locations, and whether an event happens at all — can change, especially with weather and mountain conditions. Lift tickets, rentals, lessons, transportation, and food are your own responsibility and your own cost unless we say otherwise for a specific event.",
        "Everyone at a Chatter Snow event is also covered by our [code of conduct](/code-of-conduct), which sets out what we expect from each other and how to report a problem.",
        "Participants under 18 may take part only where a parent or legal guardian has completed the required forms and given permission. Individual programs may set additional rules, supervision requirements, age limits, or screening, and those apply on top of these terms. Parental permission on its own doesn't make a program open to a minor."
      ]
    },
    {
      "id": "snow-sports-risks",
      "title": "Snow-sports risks",
      "paragraphs": [
        "Skiing and snowboarding carry real and inherent risks, including serious injury, permanent disability, and death. Those risks come from things nobody controls — snow and weather, terrain, ice and bare patches, other people on the hill, lifts, and equipment — and they cannot be eliminated. If you take part in anything we organize, you take those risks on yourself.",
        "You're responsible for riding within your ability, following the mountain's rules and Your Responsibility Code, and wearing appropriate safety equipment. Chatter Snow doesn't provide instruction, supervision, guiding, coaching, or medical care, and our volunteers aren't acting as instructors or ski patrol. Nobody at a Chatter event is checking whether a run suits you — that call is yours.",
        "Riding at a mountain is a separate matter between you and that venue. Venues and resorts set their own rules, tickets, and waivers, and those apply to you directly; we don't control them and aren't responsible for them."
      ]
    },
    {
      "id": "gear-library",
      "title": "Gear library",
      "paragraphs": [
        "The gear library is a give-away, not a rental or a loan. People donate equipment to us, we catalog it, and we pass it on free of charge to someone who needs it. What you pick up is yours to keep — there's no return date, no deposit, and nothing to bring back. If it stops being useful to you, we'd love it back for someone else, but that's a kindness, not an obligation.",
        "Requesting an item holds it for you while we get in touch. We'll confirm pickup by email.",
        "**We give gear away exactly as it reaches us.** We don't inspect, test, service, repair, certify, or guarantee it, and we make no promise that a piece of gear fits you, suits your ability, or is safe for what you plan to do with it. We have no way of knowing how old it is, how hard it was ridden, or whether it was ever damaged before it reached us.",
        "**We do not perform binding mounting or adjustment, DIN setting, boot fitting, or any other safety-critical equipment service.** Taking gear from us is not us telling you it is safe. Before you use anything from the library, it's on you to decide whether it suits you, and to have anything safety-critical — bindings above all — inspected and set up by an appropriately qualified technician. Helmets that have taken an impact, and gear past its service life, should be replaced rather than used."
      ]
    },
    {
      "id": "volunteering",
      "title": "Volunteering",
      "paragraphs": [
        "Applying to volunteer doesn't create a job, an employment relationship, or a promise of a role, and volunteering with Chatter Snow is unpaid. Some roles may require screening before you can take them on. Volunteers act on behalf of Chatter Snow only within the role they've been given."
      ]
    },
    {
      "id": "accessibility-and-inclusion",
      "title": "Accessibility and inclusion",
      "paragraphs": [
        "We want Chatter Snow's programs, events, and communications to be welcoming and usable. If you need an accommodation to take part in something — at an event, on this site, or in how we contact you — tell us and we'll work with you to find a reasonable way to make it happen. If something here is inaccessible, we'd rather hear about it than not."
      ]
    },
    {
      "id": "educational-content",
      "title": "Educational content",
      "paragraphs": [
        "Articles and guides on this site are informational starting points, not personalized advice, instruction, or a certification program. For anything involving safety, equipment setup, or an injury, check with a qualified professional — a certified technician, instructor, or medical provider."
      ]
    },
    {
      "id": "donations-and-payments",
      "title": "Donations and payments",
      "paragraphs": [
        "This site doesn't take payments and doesn't store card details. Online monetary donations aren't open yet. When they open, we'll update this page and the privacy policy first, and we'll be explicit about our tax status at that time."
      ]
    },
    {
      "id": "photos-and-content",
      "title": "Photos, video and what you send us",
      "paragraphs": [
        "The text, images, logo, and design on this site belong to Chatter Snow or the people who made them, and are used here with permission. Please don't reuse them commercially or in a way that suggests we endorse you. You're welcome to link to us, and to share our event and program pages as they are.",
        "We take photos and video at events. Where we photograph or record participants for Chatter Snow's own communications, we rely on the consent process described at registration or at the event itself, not on this page — and for anyone under 18, on a parent or guardian's consent.",
        "If a photo of you appears on this site or on a Chatter Snow social media account and you'd rather it didn't, email [info@chattersnow.org](mailto:info@chattersnow.org) and we'll take it down. We can only remove things we control — once an image has been shared onward by someone else, that's out of our hands.",
        "You keep ownership of anything you send us — a message, an application, a request. You're giving us permission to use, store, and share it as far as we reasonably need to in order to answer you, run the program you contacted us about, and keep our records."
      ]
    },
    {
      "id": "other-sites-and-venues",
      "title": "Other websites and venues",
      "paragraphs": [
        "We link to mountains, partners, and other organizations. We don't control those sites or venues and aren't responsible for their content, their terms, their safety practices, or how they handle your information."
      ]
    },
    {
      "id": "other-agreements",
      "title": "Other agreements",
      "paragraphs": [
        "These terms cover this website. Separate agreements cover separate activities — event waivers and participation agreements, gear acknowledgements, volunteer agreements, our [code of conduct](/code-of-conduct), and any rules a venue sets. Where one of those applies to something you're doing, it governs that activity, and nothing on this page replaces it or waives it on your behalf."
      ]
    },
    {
      "id": "no-warranties",
      "title": "No warranties",
      "paragraphs": [
        "We run this site as a volunteer organization and provide it as-is. We can't promise it will always be available, up to date, accurate, or free of errors, and we don't make any warranty about it beyond what the law requires of us."
      ]
    },
    {
      "id": "limitation-of-liability",
      "title": "Limits on liability",
      "paragraphs": [
        "To the fullest extent the law allows, Chatter Snow and its board members, volunteers, and organizers aren't liable for indirect or consequential losses arising from your use of this site.",
        "Nothing here limits any liability that can't be limited by law, and nothing here is a waiver of your rights in connection with an in-person event or with gear you took from the library — those are addressed by the agreements described under [other agreements](#other-agreements), where they apply."
      ]
    },
    {
      "id": "indemnification",
      "title": "Your responsibility to us",
      "paragraphs": [
        "To the fullest extent the law allows, you agree to be responsible for claims, losses, damages, and reasonable expenses that arise from your breach of these terms, your misuse of this site, or your intentional or negligent conduct in connection with Chatter Snow activities — except to the extent they were caused by Chatter Snow's own negligence, or by anything we can't lawfully disclaim responsibility for."
      ]
    },
    {
      "id": "changes",
      "title": "Changes to these terms",
      "paragraphs": [
        "We'll update this page when things change, and change the date at the top. For a change that materially affects something you've already signed up for, we'll tell you directly rather than relying on you to re-read the page."
      ]
    },
    {
      "id": "governing-law",
      "title": "Governing law",
      "paragraphs": [
        "These terms are governed by the laws of the State of New Jersey, without regard to its conflict-of-laws rules."
      ]
    },
    {
      "id": "severability",
      "title": "Severability",
      "paragraphs": [
        "If any part of these terms turns out to be unenforceable, the rest stays in effect to the fullest extent the law allows."
      ]
    },
    {
      "id": "contact",
      "title": "Contact",
      "paragraphs": [
        "Questions about these terms go to [info@chattersnow.org](mailto:info@chattersnow.org). You can also reach us through the [contact form](/contact)."
      ]
    }
  ]
}$doc$),
  ('legal.code_of_conduct', $doc${
  "title": "Code of Conduct",
  "last_updated": "September 2, 2026",
  "summary": [
    "Chatter Snow exists so that LGBTQ+ people have somewhere to ride where they don't have to brace for anything. That only works if everyone here helps make it true. This page is what we expect from each other, what we won't accept, and what to do when something goes wrong.",
    "It applies to everyone — riders, guests, volunteers, board members, partners, and sponsors — at every Chatter Snow event, on transport and in lodging we arrange, in our online spaces and group chats, on our social accounts, and any time you're representing Chatter Snow or acting on its behalf. What you say in your own life is your own business; this is about the spaces we run and the times you're standing in for us.",
    "**Something happened? Tell us.** At an event, find any Chatter organizer or volunteer. Any time, email [conduct@chattersnow.org](mailto:conduct@chattersnow.org). You don't need to be certain, be the person it happened to, or have proof. See [reporting a problem](#reporting-a-problem) for what happens next."
  ],
  "sections": [
    {
      "id": "what-we-expect",
      "title": "What we expect",
      "paragraphs": [
        "- Treat people the way they ask to be treated. Use the name and pronouns someone gives you. If you get it wrong, correct yourself and move on — a short apology is better than a long one.\n- Assume a range of experience. Beginners are the point, not an inconvenience. Nobody owes you an explanation of why they're on a green run.\n- Ask before you touch someone, their gear, or their board. Ask before you photograph or film them, and stop if they say no.\n- Take \"no\" the first time — about a run, a drink, a photo, a ride home, a conversation, a number.\n- Look after the people around you. If someone seems isolated, cold, in over their head, or uncomfortable, check in.\n- Respect people's privacy. What someone tells you about themselves — their identity, their health, their story — stays with you unless they've said otherwise. The only exceptions are narrow: passing something on to deal with a safety concern, or because we're legally required to.",
        "Chatter Snow takes photos and video at events for our own newsletters, site, and social accounts. When we do, we go on the consent process described at registration or at the event — see our [terms of use](/terms). You can tell any organizer you'd rather not be photographed, and that holds for the rest of the event."
      ]
    },
    {
      "id": "bringing-a-minor",
      "title": "If you're bringing a minor",
      "paragraphs": [
        "Chatter Snow events are built around adult community, and we're not set up or staffed to supervise anyone. Someone under 18 can come where a parent or legal guardian has given permission and completed the forms our [terms of use](/terms) require — and that adult needs to be at the event, with them, for the whole of it.",
        "Our volunteers are not chaperones and can't take that on. If the responsible adult leaves, the minor leaves too. Individual programs may set a higher age limit or their own supervision rules, and those apply on top of this."
      ]
    },
    {
      "id": "on-the-mountain",
      "title": "On the mountain",
      "paragraphs": [
        "Our volunteers are riders, not instructors, guides, or patrollers. Nobody here is supervising you, and you're responsible for your own decisions on the hill. In an emergency, get ski patrol first and tell a Chatter organizer second.",
        "Ride within your ability and follow the mountain's rules and Your Responsibility Code. People ahead of you have the right of way. Don't stop where you can't be seen from above. Don't talk anyone into terrain they've said they aren't ready for, and make a real effort to stay with the people in your group — beginners especially — rather than dropping them on a run they didn't choose.",
        "Don't ride impaired — by alcohol, cannabis, other drugs, medication, or exhaustion. If you're drinking, do it after you're done for the day, and don't pressure anyone else to drink — plenty of people here don't."
      ]
    },
    {
      "id": "what-isnt-tolerated",
      "title": "What isn't tolerated",
      "paragraphs": [
        "**How we treat each other**",
        "- Harassment or discrimination based on gender identity or expression, sexual orientation, race, ethnicity, national origin, religion, disability, body size, age, HIV status, or socioeconomic status.\n- Deliberate misgendering, deadnaming, or pressing someone about their body, transition, surgeries, or how they identify.\n- Outing anyone — to this group, to their family, to their employer, or online. This includes tagging people in photos from an event without asking.\n- Unwanted sexual attention, sexual comments, or touching. Flirting that continues after a \"no\" is harassment.\n- Photographing or filming someone who has asked you not to, or posting a photo of someone who has asked you to take it down.\n- Intimidation, stalking, following someone, or repeated unwanted contact after an event.\n- Retaliating against someone for making a report or supporting someone who did.",
        "**Staying safe**",
        "- Violence, threats of violence, or encouraging either.\n- Carrying a weapon where the law, the venue, or Chatter Snow doesn't allow it. If you're not sure, the answer at a Chatter event is no.\n- Riding impaired, or riding in a way that puts other people at risk.\n- Ignoring ski patrol, mountain staff, or venue staff.",
        "\"It was a joke\" is not a defense. The effect on the person matters more than the intent behind it."
      ]
    },
    {
      "id": "reporting-a-problem",
      "title": "Reporting a problem",
      "paragraphs": [
        "If something happens, tell us. You don't need to be certain, be the person it happened to, or have proof.",
        "**At an event:** find any Chatter organizer or volunteer. They can move you away from a situation, stay with you, or handle it on the spot.",
        "**Any time:** email [conduct@chattersnow.org](mailto:conduct@chattersnow.org). It goes to the board. Tell us what happened, roughly when, and what you'd like to see happen — and say if you'd rather a particular person not be involved in handling it.",
        "Being straight with you about what that address is: it's a list that reaches all three board members, not a separate mailbox. So if your report is about a board member, they will see it. It will be handled by the board members who aren't involved, and if that isn't possible we'll tell you and find someone outside the board — but we'd rather you knew who reads it before you write than found out afterward.",
        "You can report anonymously if you'd rather — leave your name out of the email, or ask an organizer to pass something on without attaching you to it. It's a real option and people should use it if they need it. It does cost something: we can't come back to you with questions or tell you what came of it, and that sometimes limits what we're able to do.",
        "Reporting in good faith is protected, whatever we end up concluding. If we can't establish what happened, that is not the same as deciding you lied, and nobody will be treated as though it were. Knowingly making a false report, or lying to us during a review, is a different thing — it hurts the person it's aimed at and the trust this whole process depends on, and we'll handle it under this code like anything else here.",
        "In an emergency, or if someone is in immediate danger, call 911 or ski patrol first. We'll deal with the rest afterward."
      ]
    },
    {
      "id": "how-we-handle-a-report",
      "title": "How we handle a report",
      "paragraphs": [
        "We aim to acknowledge your report within 5 days. When practicable, at least two board members review it, and anyone with a personal stake in it steps out of the process. Where that isn't possible — three people run Chatter, and a report can leave too few of us unconflicted — we'll tell you, and find someone outside the board.",
        "We share what you told us only with the people who need it to respond, and we'll tell you before we share it more widely than that. We won't contact anyone else about it without checking with you first, unless someone is in danger or we're legally required to. What we can't promise is secrecy: looking into something usually means talking to the person it's about, and sometimes to witnesses.",
        "Depending on what we find, the response can be a conversation, a warning, being asked to leave an event, being removed from a volunteer or organizational role where our governing documents allow it, or being barred from Chatter Snow events for a period or for good. We'll tell you what we did about your report, as far as we're able. We won't share the private details of someone else's situation, and asking us to won't change that.",
        "We can act on urgent safety concerns immediately, before a full review, and we can decline to keep anyone at an event. We'd rather lose an attendee than lose the room."
      ]
    },
    {
      "id": "if-you-disagree",
      "title": "If you disagree with a decision",
      "paragraphs": [
        "If you were the subject of a report and you think we got it wrong, you can ask for a second look. Email [conduct@chattersnow.org](mailto:conduct@chattersnow.org) within 14 days of our decision and tell us what you think we missed. It gets reviewed by board members who weren't part of the original decision, or — if there aren't any — by someone outside the board.",
        "We won't reverse a decision just because someone is unhappy with it, and anything we did for immediate safety stays in place while an appeal is looked at. But everyone gets one honest second look."
      ]
    },
    {
      "id": "questions",
      "title": "Questions",
      "paragraphs": [
        "Questions about this code — including suggestions for improving it — go to [info@chattersnow.org](mailto:info@chattersnow.org) or the [contact form](/contact). Please use [conduct@chattersnow.org](mailto:conduct@chattersnow.org) for reports, so they don't sit in a general inbox."
      ]
    }
  ]
}$doc$)
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
