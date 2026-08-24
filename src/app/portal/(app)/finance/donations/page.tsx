import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FinanceDonationsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Donations
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will track monetary donations received, including donor,
            amount, date, and payment method.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
