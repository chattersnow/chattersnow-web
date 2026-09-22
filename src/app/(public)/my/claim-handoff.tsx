import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import {
  RecordAccountOffer,
  type ClaimableRecord,
} from "@/components/record-account-offer";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";

/**
 * Where a sign-up hand-off lands (#1258, #1359).
 *
 * The offer after a public write is a link to `/my/sign-in` carrying one of
 * these paths, so the record survives whatever making an account costs -- a
 * password, a Google round trip, or an email confirmation opened tomorrow on a
 * different device. The guard sends a visitor with no session to sign in and
 * brings them back here, which is the whole reason these are routes and not
 * query parameters: `safeMyDestination` only carries a `next` that is a path
 * inside `/my`.
 *
 * It reads nothing about the record, and deliberately: an id that names
 * nothing, an id from another tenant and an id belonging to somebody else all
 * render this same page, and the claim RPCs are silent about which of them it
 * was. A page that said "we could not find that" would be a way to test ids.
 *
 * The one thing it does say is about the reader's own account, which is theirs
 * to know: somebody already linked to a record is told it is already on it,
 * and sent to `/my`.
 *
 * One component for both records so the two pages cannot start saying
 * different things about the same situation -- only the heading and the one
 * line under it name what was kept.
 */
export function ClaimHandoff({
  title,
  lede,
  record,
  personId,
}: {
  title: string;
  lede: string;
  record: ClaimableRecord;
  /** The reader's own `people.id`, or null when no claim is approved yet. */
  personId: string | null;
}) {
  return (
    <PageShell>
      <div className="space-y-8">
        <section>
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <h1 className="brand-display mt-4 text-3xl font-semibold tracking-brand sm:text-4xl">
              {title}
            </h1>
          </div>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed">
            {lede}
          </p>
        </section>

        <Card className="rainbow-surface">
          <CardContent>
            {personId ? (
              <Alert>
                <AlertTitle>This is on your record</AlertTitle>
                <AlertDescription>
                  <p>
                    Your account is already linked, so there is nothing to ask
                    for. <Link href={MY_PATH_PREFIX}>See your account</Link>.
                  </p>
                </AlertDescription>
              </Alert>
            ) : (
              <RecordAccountOffer
                offer="claim"
                record={record}
                skipHref={MY_PATH_PREFIX}
                headingLevel="h2"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
