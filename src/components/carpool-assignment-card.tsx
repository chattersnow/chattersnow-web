import { CarpoolCostNotice } from "@/components/carpool-cost-notice";
import { Card, CardContent } from "@/components/ui/card";
import {
  CARPOOL_CARD_HEADING,
  carpoolMateContact,
  carpoolMateName,
  carpoolRoleLabel,
  NOT_IN_A_CAR_YET,
  type CarpoolMate,
  type RegistrantCarpool,
} from "@/lib/carpool-assignment";

/**
 * "Your carpool" (#1651): the registrant's car, its driver and the other
 * riders, beside the answers and contact cards on `/my/registration/[id]` and
 * on the answers link page -- the second being where most registrants see it,
 * since most have no account.
 *
 * A server component with no state: staff change the cars, and the page
 * reads them fresh. Unplaced, it says so -- the platform does not know which
 * answer means "needs a ride", so it says it to anyone not in a car yet. The
 * cost-split notice (#1650) closes the card either way, since it is also what
 * tells them their car-mates see their first name and handle.
 */
export function CarpoolAssignmentCard({
  carpool,
  orgName,
  notice,
}: {
  carpool: RegistrantCarpool;
  /** For "ask {org} to connect you" beside somebody with no Instagram. */
  orgName: string;
  /** `events.carpool_cost_notice`. */
  notice: readonly string[];
}) {
  const car = carpool.car;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="text-base font-medium">{CARPOOL_CARD_HEADING}</h2>
        {car ? (
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="app-muted">Car</dt>
            <dd className="break-words">{car.carLabel}</dd>
            {car.leavingFrom && (
              <>
                <dt className="app-muted">Leaving from</dt>
                <dd className="break-words whitespace-pre-line">
                  {car.leavingFrom}
                </dd>
              </>
            )}
            <dt className="app-muted">Your role</dt>
            <dd>{carpoolRoleLabel(car.role)}</dd>
            {car.role === "passenger" && (
              <>
                <dt className="app-muted">Driver</dt>
                <dd>
                  {car.driver ? (
                    <Mate mate={car.driver} orgName={orgName} />
                  ) : (
                    "Not chosen yet"
                  )}
                </dd>
              </>
            )}
            <dt className="app-muted">
              {car.role === "driver" ? "Riding with you" : "Also riding"}
            </dt>
            <dd>
              {car.riders.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {car.riders.map((mate, index) => (
                    <li key={index}>
                      <Mate mate={mate} orgName={orgName} />
                    </li>
                  ))}
                </ul>
              ) : (
                "Nobody else yet"
              )}
            </dd>
          </dl>
        ) : (
          <p className="app-muted text-sm">{NOT_IN_A_CAR_YET}</p>
        )}
        <CarpoolCostNotice paragraphs={notice} />
      </CardContent>
    </Card>
  );
}

function Mate({ mate, orgName }: { mate: CarpoolMate; orgName: string }) {
  return (
    <span className="break-words">
      {carpoolMateName(mate)}{" "}
      <span className="app-muted">· {carpoolMateContact(mate, orgName)}</span>
    </span>
  );
}
