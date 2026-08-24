import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PoliciesPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Policies
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will list named organizational policies (e.g.
            whistleblower, document retention), each with a category, effective
            date, and version.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
