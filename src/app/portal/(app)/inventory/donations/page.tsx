import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InventoryDonationsPage() {
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
            This area will track in-kind item donations received into inventory,
            including donor, item details, and date received.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
