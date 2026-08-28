import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeInZone } from "@/lib/time";
import { AddDonationModal } from "./add-donation-modal";
import { CheckInModal } from "./check-in-modal";
import { RecordDistributionModal } from "./record-distribution-modal";
import type { ActiveEventForPerson } from "./queries";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

export function ActiveEventCard({
  event,
  canCheckIn,
  canRecordDonation,
  canRecordDistribution,
}: {
  event: ActiveEventForPerson;
  canCheckIn: boolean;
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
          {formatDateTimeInZone(
            event.starts_at,
            event.timezone,
            DATE_FORMAT_OPTIONS,
            "en-US",
          )}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {(canCheckIn || canRecordDonation || canRecordDistribution) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {canCheckIn && (
              <CheckInModal
                eventId={event.id}
                eventName={event.name}
                capacity={event.capacity}
                triggerLabel="Check in"
              />
            )}
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
