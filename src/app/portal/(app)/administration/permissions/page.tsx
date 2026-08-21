import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PermissionsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Permissions
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will manage role-based access permissions controlling what each portal
            user can view and edit.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
