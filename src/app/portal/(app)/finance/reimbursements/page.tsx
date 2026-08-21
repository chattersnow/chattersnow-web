import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReimbursementsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Reimbursements
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will track reimbursement requests submitted by staff and volunteers,
            including status and payout details.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
