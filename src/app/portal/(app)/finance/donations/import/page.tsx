import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HowToSection } from "@/components/how-to-section";
import { PageHelpContent } from "../../../help/help-context";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { parseGivingSettings } from "@/lib/giving";
import { DonationImportPanel } from "./donation-import-panel";
import {
  IMPORT_FIELDS,
  type DonationImportField,
  type DonationImportMapping,
} from "./donation-import-row";

export const metadata: Metadata = {
  title: "Import · Donations",
};

/**
 * `giving.import_mapping` as the panel wants it. Tolerant in the same way
 * `parseGivingSettings` is: a key nobody recognises, or a value that is not a
 * string, is dropped rather than failing the read -- a stale mapping should
 * cost the reader a picker, not the page.
 */
function parseImportMapping(value: unknown): DonationImportMapping {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const mapping: DonationImportMapping = {};
  for (const field of IMPORT_FIELDS as readonly DonationImportField[]) {
    const header = record[field];
    if (typeof header === "string" && header.trim()) mapping[field] = header;
  }
  return mapping;
}

export default async function DonationImportPage() {
  const supabase = await createSupabaseServerClient();

  // The layout above already requires finance:manage, so both RPCs are
  // reachable; they answer null to anyone who slipped past, and the page would
  // render with an empty mapping rather than somebody else's.
  const [timeZone, mappingResult, givingResult] = await Promise.all([
    getOrgTimeZone(supabase),
    supabase.rpc("get_donation_import_mapping"),
    supabase.rpc("get_giving_settings"),
  ]);

  const savedMapping = parseImportMapping(mappingResult.data);
  const giving = parseGivingSettings(givingResult.data);

  return (
    <>
      <PortalBreadcrumbs current="Import" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            Import donations
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <PageHelpContent title="How importing donations works">
          <HowToSection heading="Steps">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                Download the transactions export from wherever your giving page
                is hosted, as a CSV.
              </li>
              <li>
                Upload or paste it here and choose{" "}
                <strong className="text-foreground">Read columns</strong>. Tell
                us which of your columns holds the transaction ID, the amount
                and the date — we remember the answer.
              </li>
              <li>
                Check the preview, then import. Anything the file can&apos;t
                offer is listed rather than guessed at.
              </li>
            </ol>
          </HowToSection>
          <HowToSection heading="Running it twice is safe">
            <p>
              Each gift is matched on the provider&apos;s own transaction ID, so
              a gift already recorded is counted as a duplicate and left exactly
              as it is. Overlapping exports — last month&apos;s file and this
              month&apos;s — cannot double-count.
            </p>
          </HowToSection>
          <HowToSection heading="What it doesn't do">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                It never adds anybody to People. An imported gift starts
                anonymous; link a donor from the donation itself, one at a time,
                when you want to.
              </li>
              <li>
                It can&apos;t correct a gift. An imported row&apos;s amounts and
                transaction ID are fixed — a mistake in an import is a delete
                and a re-import.
              </li>
              <li>
                Refunds and chargebacks aren&apos;t imported. Delete the gift,
                or record the correction by hand.
              </li>
            </ul>
          </HowToSection>
          <HowToSection heading="What reaches Financial Reports">
            <p>
              Income counts what the organization{" "}
              <strong className="text-foreground">received</strong>. Where your
              provider takes a fee, the gross amount and the fee are kept beside
              the gift as context and neither one is added to income.
            </p>
          </HowToSection>
        </PageHelpContent>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>From your provider&apos;s export</CardTitle>
        </CardHeader>
        <CardContent>
          <DonationImportPanel
            timeZone={timeZone}
            savedMapping={savedMapping}
            // The giving path's own label is the right first answer: a tenant
            // that told us where its gifts are made should not have to type
            // the name again to reconcile them.
            savedProcessorLabel={giving.providerLabel}
          />
        </CardContent>
      </Card>
    </>
  );
}
