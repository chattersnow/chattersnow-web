import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MeetingsPage() {
  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Meetings
      </h1>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="app-muted text-sm">
            This area will list board and committee meetings with date, type, and
            attendees. Each meeting&apos;s Agenda, Minutes, and Resolutions will live
            as detail-view tabs on that meeting, not as separate top-level pages.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
