import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SITE_IMAGE_SLOTS, siteImageSettingKey } from "@/lib/site-images";
import { SystemSettingsForm } from "./system-settings-form";
import { SiteImagesPanel } from "./site-images-panel";

function parseThreshold(value: unknown): number | null {
  const threshold = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(threshold) ? threshold : null;
}

export default async function SystemSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data: expenseSetting },
    { data: reimbursementSetting },
    { data: siteImageSettings },
  ] = await Promise.all([
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "finance.expense_approval_threshold")
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "finance.reimbursement_approval_threshold")
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("key, value")
      .like("key", "site_images.%"),
  ]);

  const siteImageUrls: Record<string, string | null> = {};
  for (const slot of SITE_IMAGE_SLOTS) {
    const row = siteImageSettings?.find(
      (setting) => setting.key === siteImageSettingKey(slot.key),
    );
    siteImageUrls[slot.key] = typeof row?.value === "string" ? row.value : null;
  }

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        System Settings
      </h1>

      <Tabs defaultValue="workflow" className="mt-6">
        <TabsList variant="line">
          <TabsTrigger value="workflow">Workflow settings</TabsTrigger>
          <TabsTrigger value="images">Image settings</TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="app-muted max-w-2xl text-sm leading-relaxed">
              These thresholds control who can approve an expense or
              reimbursement on their own.
            </p>
            <HowToSheet title="How these thresholds are used">
              <HowToSection heading="Steps">
                <ol className="list-decimal space-y-2 pl-4">
                  <li>
                    <strong className="text-foreground">
                      Below the threshold
                    </strong>{" "}
                    — finance can approve their own expense or reimbursement
                    submission on the{" "}
                    <Link
                      href="/portal/finance/expenses"
                      className="underline hover:text-foreground"
                    >
                      Expenses
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/portal/finance/reimbursements"
                      className="underline hover:text-foreground"
                    >
                      Reimbursements
                    </Link>{" "}
                    pages.
                  </li>
                  <li>
                    <strong className="text-foreground">
                      At or above the threshold
                    </strong>{" "}
                    — an admin or board member, other than whoever submitted it,
                    has to approve or reject it instead.
                  </li>
                </ol>
              </HowToSection>
              <HowToSection heading="Who can do this">
                <p>
                  Only <strong className="text-foreground">admin</strong> can
                  change these settings.
                </p>
              </HowToSection>
              <HowToSection heading="What happens downstream">
                <ul className="list-disc space-y-2 pl-4">
                  <li>
                    These two numbers don&apos;t do anything on this page
                    directly — they&apos;re read by the expense and
                    reimbursement approval flow each time an approver opens a
                    submission, so changing one here changes behavior on those
                    two pages immediately, without a code change.
                  </li>
                  <li>
                    Every change to a threshold is written to the audit log
                    (Administration &gt; Audit log), so you can see who moved it
                    and when.
                  </li>
                </ul>
              </HowToSection>
              <HowToSection heading="Common mistakes">
                <ul className="list-disc space-y-2 pl-4">
                  <li>
                    Setting a threshold to 0 forces every submission through
                    second-approval, even trivial ones.
                  </li>
                  <li>
                    Leaving a threshold blank doesn&apos;t disable approval — it
                    just means the page falls back to always requiring a second
                    approver.
                  </li>
                </ul>
              </HowToSection>
            </HowToSheet>
          </div>
          <SystemSettingsForm
            expenseApprovalThreshold={parseThreshold(expenseSetting?.value)}
            reimbursementApprovalThreshold={parseThreshold(
              reimbursementSetting?.value,
            )}
          />
        </TabsContent>

        <TabsContent value="images" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            Set a Google Drive image for each placeholder slot on the public
            site. Leave a slot blank to fall back to the default icon
            placeholder.
          </p>
          <SiteImagesPanel slots={SITE_IMAGE_SLOTS} urls={siteImageUrls} />
        </TabsContent>
      </Tabs>
    </>
  );
}
