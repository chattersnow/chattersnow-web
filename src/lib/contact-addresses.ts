/**
 * Every Chatter Snow address published on the public site.
 *
 * All of these are Zoho distribution lists forwarding to the whole board, not
 * separate mailboxes -- there are three people running Chatter and no
 * shared-mailbox tier in play. The split is not about who reads the mail
 * today. It is so that:
 *
 *   - a reader knows where to write without guessing,
 *   - requests with a clock on them (privacy) are separable from general mail
 *     when someone has to prove they were answered in time, and
 *   - routing can change later, when there are more people, without editing a
 *     published page or invalidating an address people have already used.
 *
 * Anything added here becomes a promise the moment it ships on a page: an
 * address that bounces or goes unread is worse than not offering one. Do not
 * publish one before the list exists.
 */

/** General enquiries. The default for anything without a better home. */
export const CONTACT_EMAIL = "info@chattersnow.org";

/**
 * Access, correction, and deletion requests. Separate from CONTACT_EMAIL
 * because the privacy policy commits to answering these within 30 days, and
 * that is much easier to honour -- and to evidence -- out of general mail.
 */
export const PRIVACY_EMAIL = "privacy@chattersnow.org";

/**
 * Code of conduct reports. See the note in the code of conduct page about
 * what this list can and cannot promise while it reaches every board member.
 */
export const CONDUCT_EMAIL = "conduct@chattersnow.org";

/**
 * Vulnerability disclosure, published at /.well-known/security.txt. The
 * portal holds personal data behind RLS policies, so there needs to be a
 * route for someone to tell us when that is wrong.
 */
export const SECURITY_EMAIL = "security@chattersnow.org";
