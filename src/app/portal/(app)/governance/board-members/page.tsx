import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BoardMembersPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Board Members
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will list current and past board members, each with role/title,
            term start and end dates, and active status.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
