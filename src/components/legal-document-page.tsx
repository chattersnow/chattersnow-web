import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/legal-document";
import { legalDocumentBySlot } from "@/lib/legal-documents";
import {
  PLATFORM_LEGAL_LAST_UPDATED,
  platformLegalDescription,
  platformLegalDocument,
} from "@/lib/legal-defaults";
import {
  getPublishedLegalVersions,
  legalVersionPath,
  selectLegalVersion,
  type PublishedLegalVersion,
} from "@/lib/legal-versions";
import { getPublicSite, legalOrg, publicTitle } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTimeInZone } from "@/lib/time";

/**
 * One of the three legal documents, live or at a version (#601).
 *
 * `/privacy`, `/terms` and `/code-of-conduct` differ only by which `legal.*`
 * slot they read and what the page is called when nobody has named it, so they
 * are one component with two arguments rather than three copies of a page that
 * has grown a version notice.
 *
 * `?version=N` serves the document as it was published, from the frozen
 * snapshot rather than from anything live -- that is the point of the table
 * behind it. The shape matches `/giveaways/<id>/rules?version=N` (#1322),
 * which shipped the day before for the same question about a promotion's
 * rules; the ticket sketched `/privacy/v/<n>`, and one pattern for version
 * permalinks on one public site is worth more than either shape on its own.
 *
 * Adoption (#859) is not handled here and does not need to be: the permalink
 * is the same route as the live document, so `/terms/...` is already behind
 * `requireLegalDocumentInForce` in the layout above. A document a tenant never
 * put in force 404s at every version exactly as it does live.
 */

type LegalPageArgs = {
  /** The `legal.*` site content slot, which is also the registry key. */
  slotKey: string;
  /** What the page is called before a tenant has published a title. */
  fallbackTitle: string;
  /** The raw `?version=` parameter, if any. */
  requestedVersion?: string | string[];
};

/**
 * `<title>` and indexing for one of the three.
 *
 * A superseded version stays readable for anyone holding the link but is not
 * what a search engine should offer somebody looking for an organization's
 * privacy policy, so every `?version=` address is `noindex` -- including the
 * one that happens to be in force today, which would otherwise be a second
 * indexable address for the same text.
 */
export async function legalDocumentMetadata({
  slotKey,
  fallbackTitle,
  requestedVersion,
}: LegalPageArgs): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  const doc = site.content.document(slotKey);
  // A document with no platform prose (#686) has no description to fall back
  // on either. Without this guard `platformLegalDescription` throws here and
  // `generateMetadata` 500s the request, on a route whose page is correctly
  // about to 404.
  const hasPlatformDefault =
    legalDocumentBySlot(slotKey)?.hasPlatformDefault ?? true;
  return {
    title: publicTitle(site, doc?.title ?? fallbackTitle),
    description:
      doc || !hasPlatformDefault
        ? undefined
        : platformLegalDescription(slotKey, await legalOrg(supabase, site)),
    robots: requestedVersion ? { index: false, follow: true } : undefined,
  };
}

export async function LegalDocumentPage({
  slotKey,
  requestedVersion,
}: LegalPageArgs) {
  const registered = legalDocumentBySlot(slotKey);
  if (!registered) notFound();

  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  const own = site.content.document(slotKey);

  // In force, and nothing to serve. The adoption toggle and
  // `publish_site_content()` both refuse to create this state (#686), so
  // reaching it means somebody wrote `site_content` directly -- and an empty
  // document under an organization's name is worse than a 404, because it
  // reads as a document they adopted.
  if (!own && !registered.hasPlatformDefault) notFound();

  const versions = await getPublishedLegalVersions(supabase, registered.key);

  // What the tenant is serving right now, which is what a version is measured
  // against. A tenant back on the platform's default has no version in force
  // even where it has published versions in the past -- the newest of them is
  // superseded by the default, not by another version.
  const inForce = own ? versions[0] : undefined;

  const asked =
    typeof requestedVersion === "string" && requestedVersion !== ""
      ? requestedVersion
      : undefined;

  if (asked) {
    const chosen = selectLegalVersion(versions, asked);
    // A version number this organization never published is a 404 rather than
    // a redirect to the current text: an address that quietly serves something
    // other than what it names gives the reader no way to tell.
    if (!chosen) notFound();
    const superseded = chosen.version !== inForce?.version;
    return (
      <LegalDocument
        doc={chosen.content}
        // Above the title, not only in the appendix. Somebody sent this link
        // reads the whole document believing it is the one that governs them,
        // and a note at the foot of a privacy policy is a note nobody reaches.
        banner={
          superseded ? (
            <p className="mb-6 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">
              <strong>This version is no longer in force.</strong> It is version{" "}
              {chosen.version}, effective {effectiveDate(chosen)}.{" "}
              <Link
                href={registered.route}
                className="hover:text-foreground underline underline-offset-4"
              >
                Read the {registered.label.toLowerCase()} in force
              </Link>
              .
            </p>
          ) : undefined
        }
        appendix={
          <VersionNotice
            document={registered}
            versions={versions}
            showing={chosen}
            inForce={inForce}
            organization={site.name}
            servingPlatformDefault={!own && registered.hasPlatformDefault}
          />
        }
      />
    );
  }

  const doc =
    own ?? platformLegalDocument(slotKey, await legalOrg(supabase, site));
  return (
    <LegalDocument
      doc={doc}
      appendix={
        <VersionNotice
          document={registered}
          versions={versions}
          showing={inForce}
          inForce={inForce}
          organization={site.name}
          servingPlatformDefault={!own && registered.hasPlatformDefault}
        />
      }
    />
  );
}

/** "21 September 2026", in the organization's zone as it was at publish time. */
function effectiveDate(version: PublishedLegalVersion): string {
  return formatDateTimeInZone(version.effective_at, version.time_zone, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Which version this is, and where the others are.
 *
 * Rendered as the document's appendix rather than as a section of it, because
 * it is a statement *about* the document: a section would be something an
 * editor could rewrite, and "this version has been superseded" is not a
 * sentence a tenant gets to edit.
 *
 * Nothing renders at all for a tenant with no history and no default to
 * explain -- which is only the case where the version read failed, since every
 * published document was backfilled as version 1 and every tenant without one
 * is being served the platform's text.
 */
function VersionNotice({
  document,
  versions,
  showing,
  inForce,
  organization,
  servingPlatformDefault,
}: {
  document: { route: string; label: string };
  versions: readonly PublishedLegalVersion[];
  /** The version on screen, or undefined when the live text is not a version. */
  showing: PublishedLegalVersion | undefined;
  inForce: PublishedLegalVersion | undefined;
  organization: string | null;
  servingPlatformDefault: boolean;
}) {
  const superseded = Boolean(showing) && showing?.version !== inForce?.version;
  if (!showing && !servingPlatformDefault) return null;
  if (!showing && !versions.length) {
    // The platform's default and no history behind it: say which text this is
    // and when it last changed, and stop. There is nothing to link.
    return (
      <Notice>
        <p className="app-muted">
          This is the platform&rsquo;s standard {document.label.toLowerCase()},
          last updated {PLATFORM_LEGAL_LAST_UPDATED}.{" "}
          {organization ?? "This organization"} has not published a document of
          its own.
        </p>
      </Notice>
    );
  }

  return (
    <Notice>
      <p className="app-muted">
        {showing ? (
          superseded ? (
            <>
              This is version {showing.version} of this document, effective{" "}
              {effectiveDate(showing)}. It has been superseded.{" "}
              <Link
                href={document.route}
                className="hover:text-foreground underline underline-offset-4"
              >
                Read the {document.label.toLowerCase()} in force
              </Link>
              .
            </>
          ) : (
            <>
              This is version {showing.version} of this document, in force since{" "}
              {effectiveDate(showing)}.
            </>
          )
        ) : (
          <>
            This is the platform&rsquo;s standard {document.label.toLowerCase()}
            , last updated {PLATFORM_LEGAL_LAST_UPDATED}.{" "}
            {organization ?? "This organization"} published the versions below
            and is no longer serving any of them.
          </>
        )}
      </p>
      {(versions.length > 1 || !showing) && (
        <ul className="app-muted mt-3 space-y-1">
          {versions.map((entry) => (
            <li key={entry.version}>
              {entry.version === showing?.version ? (
                <span>
                  Version {entry.version} — effective {effectiveDate(entry)}
                </span>
              ) : (
                <Link
                  href={legalVersionPath(document.route, entry.version)}
                  className="hover:text-foreground underline underline-offset-4"
                >
                  Version {entry.version} — effective {effectiveDate(entry)}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Notice>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <section
      id="versions"
      className="border-t border-[var(--line)] pt-6 text-sm"
    >
      {children}
    </section>
  );
}
