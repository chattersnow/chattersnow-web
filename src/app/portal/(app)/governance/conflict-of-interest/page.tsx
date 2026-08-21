import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConflictOfInterestPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Conflict of Interest
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will track per-person annual conflict of interest disclosure
            statements, including on-file date and any noted conflicts.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
