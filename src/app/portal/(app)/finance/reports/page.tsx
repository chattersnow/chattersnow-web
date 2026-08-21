import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FinancialReportsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Financial Reports
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will provide summary financial reports covering income, expenses, and
            donations across a selected period.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
