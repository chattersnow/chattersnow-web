import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SystemSettingsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        System Settings
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will hold organization-wide configuration options for the operations
            portal.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
