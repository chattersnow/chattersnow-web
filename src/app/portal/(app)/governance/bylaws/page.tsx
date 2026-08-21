import { GovernanceTabs } from "../governance-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BylawsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Bylaws
      </h1>

      <GovernanceTabs />

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will hold the governing bylaws document, with version,
            effective date, and amendment history.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
