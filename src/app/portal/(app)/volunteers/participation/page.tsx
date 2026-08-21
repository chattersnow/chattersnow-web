import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ParticipationPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Participation
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will track volunteer participation history, including hours logged and
            events or programs each volunteer supported. Volunteer records will link back to
            entries in People.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
