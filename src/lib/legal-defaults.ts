import { RETENTION_POLICIES } from "@/lib/retention";
import {
  LEGAL_DOCUMENT_OUTLINES,
  type LegalDocumentContent,
} from "@/lib/site-content";

/**
 * The documents a tenant that has published none of its own is served (#858).
 *
 * These used to be Chatter Snow's, rendered from JSX and described in the
 * editor as "the platform's document": provisioning a tenant published another
 * organization's legal position, complete with snow-sports risk, a gear library
 * and New Jersey governing law, under the new tenant's brand. Chatter Snow's
 * documents are now its own tenant's published rows, and what is left here is
 * what the platform can honestly say for *any* nonprofit running *this*
 * application.
 *
 * Three rules held while writing them, and are worth holding to:
 *
 *   1. **Only what the software does.** Every factual claim below is about
 *      behaviour in this repository -- the forms that exist, the retention job
 *      that runs, the providers the deployment uses. Where only the
 *      organization can answer (its governing law, its charitable status, the
 *      risks its activities carry), the section is absent rather than vague.
 *   2. **No commitments on a tenant's behalf.** Numbers a tenant has not agreed
 *      to -- "we acknowledge within 5 days", "two board members review it" --
 *      are the same hazard as borrowed terms, so the process is described
 *      without them. Chatter Snow's own document keeps its board's numbers,
 *      because its board agreed to them.
 *   3. **No links to routes that may not exist.** Every public page except the
 *      legal ones can be hidden per tenant (`page_visibility.*`), so these
 *      documents name the forms they describe rather than linking to them. The
 *      exceptions are /privacy, which #859 keeps served for every tenant, and a
 *      #fragment, which stays inside the document it is written in.
 *
 * This is a starting point for an organization's own counsel to rewrite, not
 * legal advice, and the Site Content editor says so where the slot is edited.
 */

export type LegalOrgContext = {
  /** The organization's name, from `tenants.name`. */
  name: string;
  /** `org.email_general` -- general enquiries. */
  emailGeneral: string;
  /** `org.email_privacy` -- access, correction and deletion requests. */
  emailPrivacy: string;
  /** `org.email_conduct` -- code of conduct reports. */
  emailConduct: string;
};

/**
 * Printed on all three documents. Bump it in the same commit as any change to
 * the prose below: a stale date on a legal page is worse than none.
 */
export const PLATFORM_LEGAL_LAST_UPDATED = "September 10, 2026";

type Prose = (org: LegalOrgContext) => string[];

type DocumentProse = {
  /** Search and link-preview description, used when the tenant has no document. */
  description: (org: LegalOrgContext) => string;
  summary: Prose;
  /** One entry per id in this document's `LEGAL_DOCUMENT_OUTLINES` entry. */
  sections: Record<string, Prose>;
};

const mailto = (address: string) => `[${address}](mailto:${address})`;

const bullets = (items: readonly string[]) =>
  items.map((item) => `- ${item}`).join("\n");

const PRIVACY: DocumentProse = {
  description: (org) =>
    `What personal information ${org.name} collects through this site, why we collect it, how long we keep it, and how to ask for a copy or a deletion.`,
  summary: (org) => [
    `${org.name} uses this site to run its events, programs and other work. This policy explains what personal information the site collects, why we collect it, who can see it, how long we keep it, and how to ask us for a copy or a deletion.`,
    `The short version: we try to collect only what we need to run our programs and keep in touch with you, we don't sell or rent it to anyone, and you can ask us to delete it — apart from the few records we're legally required to keep — by emailing ${mailto(org.emailPrivacy)}.`,
  ],
  sections: {
    "what-we-collect": () => [
      "Everything below is information you type into a form yourself. We don't buy personal information about you from anyone else.",
      bullets([
        "**Contact form** — your name, email address, the topic you pick, and your message. We use it to read what you sent and reply to you.",
        "**Volunteer application** — your name, email address, and, if you choose to give them, your phone number, the roles you're interested in, and your availability. We use it to review your application, follow up with you, and let you check its status with the reference code we give you.",
        "**Event registration** — your name, email address, party size, and, optionally, your phone number, social handle and any notes you add. If you fill in a participant profile, we also store what it asks for: which activity you do, your experience level, and where you prefer to go. We use it to hold your spot, plan the event around who is coming, and send you the details.",
        "**Gear requests** — your name, email address, and, optionally, your phone number and any notes about what you need. We use it to match you with what you asked for and arrange a time to hand it over.",
        "**Portal accounts** — for the people who run the organization: the email address you sign in with, and a session cookie that keeps you signed in. Signing in with Google shares that account's email address and name with us.",
      ]),
      "We also record the IP address a form submission came from and store it with that submission. It is used only to stop spam and abuse — to limit how many times the same sender can submit a form in a short window — and it is deleted when the submission it belongs to is deleted.",
      "Not every form above is open on every site. Where a section of this site is turned off, its form collects nothing, because there is nothing to submit.",
    ],
    "what-we-dont-do": () => [
      bullets([
        "We don't sell, rent, or trade your personal information, and we don't share it with advertisers.",
        "We don't use advertising or cross-site tracking cookies on this site.",
        "We don't take payments or store card details on this site.",
        "We don't publish your information. Names and photos appear on the public site only where someone has agreed to that separately.",
      ]),
    ],
    "how-long-we-keep-it": () => [
      "We keep personal information only for as long as we reasonably need it for the purposes described here. When we no longer need it, we delete it, or we strip the personal details and keep only the count — how many people came to an event, how many were there for the first time — which tells us nothing about you.",
      bullets(
        RETENTION_POLICIES.map(
          (policy) => `**${policy.what}** — ${policy.howLong}`,
        ),
      ),
      "These periods are enforced by a scheduled job, not by hand: it runs nightly and removes or anonymizes whatever has passed its date, and keeps a record of what it did so we can check the policy is being applied.",
      "We also keep encrypted backups of the database so the site can be restored after a failure. A backup is taken nightly and deleted after 90 days, so information removed from the live site — by the scheduled job or at your request — may persist in a backup for up to 90 days after that. Backups are used only to restore the site, not to look up information that has been deleted.",
      "Some records have to outlive those periods because the law or our own accounting requires it — donation and financial records we need for our reporting and tax filings, for example. A few organizational records, such as tax filings, financial statements, and governance records, we keep permanently. If you ask us to delete your information and something falls into one of those categories, we'll tell you what we have to keep and why.",
    ],
    "who-can-see-it": (org) => [
      `Inside ${org.name}, what you submit is visible to the people whose role covers it — the people running events see event registrations, whoever coordinates volunteers sees volunteer applications, and so on. Access is enforced in the database by the permissions attached to each role, not just hidden in the interface.`,
      "Running an event means the volunteers staffing it may need to see who registered — a check-in list, a head count, who asked for something or noted something we should know about on the day. We don't publish participant lists, and we don't give your name or contact details to a venue, a partner, or a sponsor unless you have agreed to that separately, or the venue requires it to let the group in and we've told you so when you registered.",
      "Outside the organization, we rely on a small number of service providers to run the site. They handle information on our behalf, under their own terms and privacy policies:",
      bullets([
        "**Supabase** — hosts our database and handles portal sign-in.",
        "**Vercel** — hosts this website and provides the aggregate traffic counts we use to see which pages get visited.",
        "**Resend** — delivers the email this site sends, such as a confirmation or a reply to something you submitted.",
        "**Google** — only if someone chooses to sign in to the portal with a Google account.",
      ]),
      "We'll also share information if we're legally required to, or if it's necessary to protect someone's safety.",
    ],
    "how-we-protect-it": () => [
      "We use reasonable administrative, technical, and organizational safeguards to protect what you give us: information travels to the site over an encrypted connection, portal accounts are individual rather than shared, and access to each kind of record is limited to the roles that need it and enforced by the database itself.",
      "No website or database is perfectly secure, and we can't promise otherwise. If a breach ever affects your information, we'll tell you and the authorities we're required to tell, as promptly as we can.",
    ],
    "cookies-and-analytics": () => [
      "The public site sets no cookies of its own. The one cookie we do set is the session cookie that keeps the people running the organization signed in to the operations portal, and it's only set once someone signs in.",
      "We use Vercel Web Analytics to count page views. It reports visits in aggregate, sets no cookies and stores nothing on your device, and doesn't follow you across other websites. We don't run Google Analytics or any advertising analytics on this site.",
    ],
    "other-sites": () => [
      "We link out to partner organizations, sponsors, venues, and our own social accounts. Once you follow one of those links you're on someone else's site, and what they collect is covered by their privacy policy, not this one — worth a read before you hand them anything. The same goes for any ticketing or payment service we may use in the future; if we add one, we'll name it here first.",
    ],
    "your-choices": (org) => [
      `Email ${mailto(org.emailPrivacy)} and you can ask us to:`,
      bullets([
        "send you a copy of what we hold about you,",
        "correct anything that's wrong,",
        "delete your information, subject to the records we're required to keep, and",
        "stop emailing you about our events, programs, or volunteering.",
      ]),
      "So that we don't hand your information to someone else, please write from the email address you gave us, or be ready to confirm the details of the submission you're asking about.",
    ],
    minors: () => [
      "This site isn't directed at children under 13, and we don't knowingly collect their personal information through it. Where a program is open to people under 18, we ask a parent or guardian to complete the forms. If you believe a child has given us information through this site, email us and we'll delete it.",
    ],
    changes: () => [
      "If we start collecting something new or using it differently, we'll update this page and change the date at the top. For a change that materially affects information you've already given us, we'll say so directly rather than relying on you to re-read the page.",
    ],
    contact: (org) => [
      `Questions about this policy, or about anything we hold on you, go to ${mailto(org.emailPrivacy)}. You can also reach us at ${mailto(org.emailGeneral)}.`,
    ],
  },
};

const TERMS: DocumentProse = {
  description: (org) =>
    `The terms you agree to when you use the ${org.name} website, sign up for an event, apply to volunteer, or get in touch.`,
  summary: (org) => [
    `These terms cover this website and the things you can do through it — reading about us, signing up for an event, applying to volunteer, asking for something we offer, and getting in touch. By using the site you're agreeing to them. If you don't agree, please don't use the site.`,
    `The short version: ${org.name} is a nonprofit. Signing up here is a request, not a confirmed spot, and the site itself takes no money.`,
    "How we handle the information you give us is covered separately, in our [privacy policy](/privacy).",
  ],
  sections: {
    "who-we-are": (org) => [
      `${org.name} runs this website. Where these terms refer to our board, organizers, or volunteers, that describes how we govern and run ourselves.`,
      "Our legal and tax status, and whether a contribution to us is tax-deductible, are stated where we ask for support. Nothing on this site should be read as claiming a status we don't hold.",
    ],
    "using-this-site": () => [
      "Use the site for its intended purpose, and please don't:",
      bullets([
        "submit someone else's personal information, or sign someone up for something without their say-so,",
        "submit deliberately false information on a form, including a fake name or an email address that isn't yours,",
        "send harassing, threatening, hateful, or discriminatory content through any form on this site,",
        "try to get into parts of the site you haven't been given access to, including the operations portal, or interfere with how the site runs for anyone else, or",
        "scrape, bulk-download, or automatically submit to the site. We rate-limit form submissions to keep spam out.",
      ]),
      "We may decline or remove a submission, or turn down a request to participate, if it breaks these terms.",
    ],
    "events-and-programs": () => [
      "Registering through this site is a request for a spot, not a confirmed one. Spots are limited, and we'll confirm by email. Event details — dates, times, locations, and whether an event happens at all — can change. Anything not explicitly included in an event is your own responsibility and your own cost.",
      "Everyone at one of our events is also covered by our code of conduct, which sets out what we expect from each other and how to report a problem.",
      "Participants under 18 may take part only where a parent or legal guardian has completed the required forms and given permission. Individual programs may set additional rules, supervision requirements, age limits, or screening, and those apply on top of these terms. Parental permission on its own doesn't make a program open to a minor.",
    ],
    volunteering: (org) => [
      `Applying to volunteer doesn't create a job, an employment relationship, or a promise of a role, and volunteering with ${org.name} is unpaid. Some roles may require screening before you can take them on. Volunteers act on our behalf only within the role they've been given.`,
    ],
    "accessibility-and-inclusion": () => [
      "We want our programs, events, and communications to be welcoming and usable. If you need an accommodation to take part in something — at an event, on this site, or in how we contact you — tell us and we'll work with you to find a reasonable way to make it happen. If something here is inaccessible, we'd rather hear about it than not.",
    ],
    "educational-content": () => [
      "Articles and guides on this site are informational starting points, not personalized advice, instruction, or a certification program. For anything involving safety, equipment, or an injury, check with a qualified professional.",
    ],
    "donations-and-payments": () => [
      "This site doesn't take payments and doesn't store card details. If that changes, we'll update this page and the privacy policy first, and we'll be explicit about our tax status at that time.",
    ],
    "photos-and-content": (org) => [
      `The text, images, logo, and design on this site belong to ${org.name} or the people who made them, and are used here with permission. Please don't reuse them commercially or in a way that suggests we endorse you. You're welcome to link to us, and to share our event and program pages as they are.`,
      "We take photos and video at events. Where we photograph or record participants for our own communications, we rely on the consent process described at registration or at the event itself, not on this page — and for anyone under 18, on a parent or guardian's consent.",
      `If a photo of you appears on this site or on one of our social media accounts and you'd rather it didn't, email ${mailto(org.emailGeneral)} and we'll take it down. We can only remove things we control — once an image has been shared onward by someone else, that's out of our hands.`,
      "You keep ownership of anything you send us — a message, an application, a request. You're giving us permission to use, store, and share it as far as we reasonably need to in order to answer you, run the program you contacted us about, and keep our records.",
    ],
    "other-sites-and-venues": () => [
      "We link to partners, venues, and other organizations. We don't control those sites or venues and aren't responsible for their content, their terms, their safety practices, or how they handle your information.",
    ],
    "other-agreements": () => [
      "These terms cover this website. Separate agreements cover separate activities — event waivers and participation agreements, volunteer agreements, our code of conduct, and any rules a venue sets. Where one of those applies to something you're doing, it governs that activity, and nothing on this page replaces it or waives it on your behalf.",
    ],
    "no-warranties": () => [
      "We provide this site as-is. We can't promise it will always be available, up to date, accurate, or free of errors, and we don't make any warranty about it beyond what the law requires of us.",
    ],
    "limitation-of-liability": (org) => [
      `To the fullest extent the law allows, ${org.name} and its board members, volunteers, and organizers aren't liable for indirect or consequential losses arising from your use of this site.`,
      "Nothing here limits any liability that can't be limited by law, and nothing here is a waiver of your rights in connection with an in-person event — those are addressed by the agreements described under [other agreements](#other-agreements), where they apply.",
    ],
    indemnification: (org) => [
      `To the fullest extent the law allows, you agree to be responsible for claims, losses, damages, and reasonable expenses that arise from your breach of these terms, your misuse of this site, or your intentional or negligent conduct in connection with our activities — except to the extent they were caused by ${org.name}'s own negligence, or by anything we can't lawfully disclaim responsibility for.`,
    ],
    changes: () => [
      "We'll update this page when things change, and change the date at the top. For a change that materially affects something you've already signed up for, we'll tell you directly rather than relying on you to re-read the page.",
    ],
    severability: () => [
      "If any part of these terms turns out to be unenforceable, the rest stays in effect to the fullest extent the law allows.",
    ],
    contact: (org) => [
      `Questions about these terms go to ${mailto(org.emailGeneral)}.`,
    ],
  },
};

const CODE_OF_CONDUCT: DocumentProse = {
  description: (org) =>
    `What we expect from everyone at ${org.name} events and in our spaces, what isn't tolerated, and how to report a problem.`,
  summary: (org) => [
    `This page is what we expect from each other at ${org.name}, what we won't accept, and what to do when something goes wrong.`,
    "It applies to everyone — participants, guests, volunteers, board members, partners, and sponsors — at every event we run, in the spaces and group chats we host, on our social accounts, and any time you're representing us or acting on our behalf. What you say in your own life is your own business; this is about the spaces we run and the times you're standing in for us.",
    `Something happened? At an event, find any of our organizers or volunteers. Any time, email ${mailto(org.emailConduct)}. You don't need to be certain, be the person it happened to, or have proof.`,
  ],
  sections: {
    "what-we-expect": () => [
      bullets([
        "Treat people the way they ask to be treated. Use the name and pronouns someone gives you. If you get it wrong, correct yourself and move on — a short apology is better than a long one.",
        "Assume a range of experience. Beginners are the point, not an inconvenience.",
        "Ask before you touch someone or their belongings. Ask before you photograph or film them, and stop if they say no.",
        'Take "no" the first time — about an activity, a drink, a photo, a ride home, a conversation, a number.',
        "Look after the people around you. If someone seems isolated, unwell, in over their head, or uncomfortable, check in.",
        "Respect people's privacy. What someone tells you about themselves — their identity, their health, their story — stays with you unless they've said otherwise. The only exceptions are narrow: passing something on to deal with a safety concern, or because we're legally required to.",
      ]),
      "We take photos and video at events for our own newsletters, site, and social accounts. When we do, we go on the consent process described at registration or at the event, which our terms of use set out. You can tell any organizer you'd rather not be photographed, and that holds for the rest of the event.",
    ],
    "what-isnt-tolerated": () => [
      "**How we treat each other**",
      bullets([
        "Harassment or discrimination based on gender identity or expression, sexual orientation, race, ethnicity, national origin, religion, disability, body size, age, health status, or socioeconomic status.",
        "Deliberate misgendering, deadnaming, or pressing someone about their body, their health, or how they identify.",
        "Outing anyone — to this group, to their family, to their employer, or online. This includes tagging people in photos from an event without asking.",
        'Unwanted sexual attention, sexual comments, or touching. Flirting that continues after a "no" is harassment.',
        "Photographing or filming someone who has asked you not to, or posting a photo of someone who has asked you to take it down.",
        "Intimidation, stalking, following someone, or repeated unwanted contact after an event.",
        "Retaliating against someone for making a report or supporting someone who did.",
      ]),
      "**Staying safe**",
      bullets([
        "Violence, threats of violence, or encouraging either.",
        "Carrying a weapon where the law, the venue, or we don't allow it. If you're not sure, the answer at one of our events is no.",
        "Taking part impaired, or behaving in a way that puts other people at risk.",
        "Ignoring venue staff or emergency personnel.",
      ]),
      '"It was a joke" is not a defense. The effect on the person matters more than the intent behind it.',
    ],
    "reporting-a-problem": (org) => [
      "If something happens, tell us. You don't need to be certain, be the person it happened to, or have proof.",
      "**At an event:** find any of our organizers or volunteers. They can move you away from a situation, stay with you, or handle it on the spot.",
      `**Any time:** email ${mailto(org.emailConduct)}. Tell us what happened, roughly when, and what you'd like to see happen — and say if you'd rather a particular person not be involved in handling it.`,
      "You can report anonymously if you'd rather — leave your name out of the email, or ask an organizer to pass something on without attaching you to it. It's a real option and people should use it if they need it. It does cost something: we can't come back to you with questions or tell you what came of it, and that sometimes limits what we're able to do.",
      "Reporting in good faith is protected, whatever we end up concluding. If we can't establish what happened, that is not the same as deciding you lied, and nobody will be treated as though it were. Knowingly making a false report, or lying to us during a review, is a different thing — it hurts the person it's aimed at and the trust this whole process depends on, and we'll handle it under this code like anything else here.",
      "In an emergency, or if someone is in immediate danger, call your local emergency number first. We'll deal with the rest afterward.",
    ],
    "how-we-handle-a-report": () => [
      "We aim to acknowledge a report promptly. Where it is practicable, more than one person reviews it, and anyone with a personal stake in it steps out of the process. Where that isn't possible, we'll tell you, and find someone outside the organization.",
      "We share what you told us only with the people who need it to respond, and we'll tell you before we share it more widely than that. We won't contact anyone else about it without checking with you first, unless someone is in danger or we're legally required to. What we can't promise is secrecy: looking into something usually means talking to the person it's about, and sometimes to witnesses.",
      "Depending on what we find, the response can be a conversation, a warning, being asked to leave an event, being removed from a volunteer or organizational role where our governing documents allow it, or being barred from our events for a period or for good. We'll tell you what we did about your report, as far as we're able. We won't share the private details of someone else's situation, and asking us to won't change that.",
      "We can act on urgent safety concerns immediately, before a full review, and we can decline to keep anyone at an event. We'd rather lose an attendee than lose the room.",
    ],
    "if-you-disagree": (org) => [
      `If you were the subject of a report and you think we got it wrong, you can ask for a second look. Email ${mailto(org.emailConduct)} within a reasonable time of our decision and tell us what you think we missed. It gets reviewed by people who weren't part of the original decision, or — if there aren't any — by someone outside the organization.`,
      "We won't reverse a decision just because someone is unhappy with it, and anything we did for immediate safety stays in place while an appeal is looked at. But everyone gets one honest second look.",
    ],
    questions: (org) => [
      `Questions about this code — including suggestions for improving it — go to ${mailto(org.emailGeneral)}. Please use ${mailto(org.emailConduct)} for reports, so they don't sit in a general inbox.`,
    ],
  },
};

const PLATFORM_LEGAL_PROSE: Record<string, DocumentProse> = {
  "legal.privacy": PRIVACY,
  "legal.terms": TERMS,
  "legal.code_of_conduct": CODE_OF_CONDUCT,
};

/** The `legal.*` slot keys the platform has a document for. */
export const PLATFORM_LEGAL_SLOT_KEYS = Object.keys(PLATFORM_LEGAL_PROSE);

function prose(slotKey: string): DocumentProse {
  const found = PLATFORM_LEGAL_PROSE[slotKey];
  if (!found) throw new Error(`No platform document for ${slotKey}`);
  return found;
}

/**
 * The platform's document for a `legal.*` slot, named for this organization.
 *
 * The section order and headings come from `LEGAL_DOCUMENT_OUTLINES` and the
 * prose is looked up by id, so a heading with no prose is a build-time-visible
 * mistake rather than an empty section on a published page.
 */
export function platformLegalDocument(
  slotKey: string,
  org: LegalOrgContext,
): LegalDocumentContent {
  const outline = LEGAL_DOCUMENT_OUTLINES[slotKey];
  const { sections } = prose(slotKey);
  return {
    title: outline.title,
    last_updated: PLATFORM_LEGAL_LAST_UPDATED,
    summary: prose(slotKey).summary(org),
    sections: outline.sections.map((section) => {
      const write = sections[section.id];
      if (!write) {
        throw new Error(`No prose for ${slotKey} section "${section.id}"`);
      }
      return { ...section, paragraphs: write(org) };
    }),
  };
}

/** Search and link-preview description for the platform's own document. */
export function platformLegalDescription(
  slotKey: string,
  org: LegalOrgContext,
): string {
  return prose(slotKey).description(org);
}
