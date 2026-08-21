import { GovernanceTabs } from "../governance-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AnnualRequirementsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Annual Requirements
      </h1>

      <GovernanceTabs />

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will track recurring compliance items (e.g. annual report,
            IRS Form 990, state charitable registration renewal) with due date,
            completion status/date, and responsible party.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
