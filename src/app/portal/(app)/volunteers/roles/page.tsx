import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function VolunteerRolesPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Roles
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will define volunteer role types and their responsibilities, available
            for assignment across events and programs.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
