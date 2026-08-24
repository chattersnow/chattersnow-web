import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddDonationModal } from "./add-donation-modal";
import { RecordDistributionModal } from "./record-distribution-modal";
import type { ActiveEventForPerson } from "./queries";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ActiveEventCard({
  event,
  canRecordDonation,
  canRecordDistribution,
}: {
  event: ActiveEventForPerson;
  canRecordDonation: boolean;
  canRecordDistribution: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{event.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="app-muted text-sm">
          {dateFormatter.format(new Date(event.starts_at))}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {(canRecordDonation || canRecordDistribution) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {canRecordDonation && (
              <AddDonationModal
                eventId={event.id}
                triggerLabel="Accept a donation"
              />
            )}
            {canRecordDistribution && (
              <RecordDistributionModal
                eventId={event.id}
                triggerLabel="Record a distribution"
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
