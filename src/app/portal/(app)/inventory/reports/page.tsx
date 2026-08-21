import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InventoryReportsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Inventory Reports
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will provide summary reports on inventory levels, donation totals, and
            distribution activity over time.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
