import { ViewerTime } from "@/components/viewer-time";
import { deliveryMethodLabel } from "@/lib/gear-requests";
import { formatCalendarDate, formatCurrency, formatNumber } from "@/lib/format";
import { personRoleLabel } from "@/lib/person-roles";
import type { Lexicon } from "@/lib/lexicon";
import {
  gearRequestStanding,
  groupGear,
  groupGiving,
  groupVolunteering,
  splitEvents,
  volunteerApplicationStanding,
  type GearHistory,
  type GivingHistory,
  type MyEventRegistration,
  type MyHistory,
  type VolunteerHistory,
} from "@/lib/constituent/history";
import { MyEntry, MyGroup, MySection, MyStatus } from "./history-shell";

/**
 * A linked constituent's own history (#1163): events, volunteering, giving and
 * gear, read through the definer RPCs in
 * `20260916070000_constituent_history.sql`.
 *
 * **A section with no rows is not rendered.** Those two words cover both rules
 * the ticket asks for at once: a person who has never volunteered holds no
 * volunteer role and gets no volunteering section, and a tenant that has
 * switched Inventory off has no gear rows to return, so its section is absent
 * for the same reason rather than through a second check here. `is_volunteer`
 * and its siblings are themselves derived from exactly these tables
 * (`person_role_flags()`), so "holds the role" and "has rows" are the same
 * question asked twice.
 */
export function MyHistorySections({
  history,
  vocabulary,
}: {
  history: MyHistory;
  vocabulary: Lexicon;
}) {
  const events = splitEvents(history.events, new Date());
  const volunteering = groupVolunteering(history.volunteering);
  const giving = groupGiving(history.giving);
  const gear = groupGear(history.gear);

  return (
    <>
      {history.events.length > 0 && <EventsSection events={events} />}
      {history.volunteering.length > 0 && (
        <VolunteeringSection
          volunteering={volunteering}
          label={personRoleLabel("is_volunteer", vocabulary)}
        />
      )}
      {history.giving.length > 0 && (
        <GivingSection giving={giving} vocabulary={vocabulary} />
      )}
      {history.gear.length > 0 && (
        <GearSection gear={gear} vocabulary={vocabulary} />
      )}
    </>
  );
}

/**
 * Upcoming first. It is the thing a person actually opens this page for --
 * usually on a phone, usually to check where they are meant to be -- and what
 * they already did can wait below it.
 */
function EventsSection({
  events,
}: {
  events: { upcoming: MyEventRegistration[]; past: MyEventRegistration[] };
}) {
  const attended = events.past.filter((row) => row.attended).length;

  return (
    <MySection
      title="Events"
      summary={
        events.upcoming.length > 0
          ? `${formatNumber(events.upcoming.length)} coming up`
          : attended > 0
            ? `${formatNumber(attended)} attended`
            : undefined
      }
    >
      <MyGroup title="Coming up" isEmpty={events.upcoming.length === 0}>
        {events.upcoming.map((row) => (
          <EventEntry key={row.registration_id} row={row} />
        ))}
      </MyGroup>
      <MyGroup title="Past" isEmpty={events.past.length === 0}>
        {events.past.map((row) => (
          <EventEntry key={row.registration_id} row={row} />
        ))}
      </MyGroup>
    </MySection>
  );
}

function EventEntry({ row }: { row: MyEventRegistration }) {
  return (
    <MyEntry
      primary={row.event_name}
      // The event's own zone as the fallback, which is what the public site
      // shows an event in and is nearly always the reader's zone too, so the
      // first paint is usually already right (#1057).
      secondary={
        <>
          <ViewerTime iso={row.starts_at} fallbackZone={row.timezone} />
          {row.location && ` · ${row.location}`}
          {row.party_size > 1 && ` · Party of ${formatNumber(row.party_size)}`}
        </>
      }
      status={
        row.attended ? <MyStatus tone="done">Attended</MyStatus> : undefined
      }
    />
  );
}

/**
 * Applications, shifts and hours in one section, because they are one thing to
 * the person who did them. The hours total is the headline: it is the number a
 * volunteer is asked for by a school, an employer or a scholarship form.
 */
function VolunteeringSection({
  volunteering,
  label,
}: {
  volunteering: VolunteerHistory;
  label: string;
}) {
  const { applications, signups, hours, unconfirmedHours, totalHours, byRole } =
    volunteering;

  return (
    <MySection
      title={`${label} activity`}
      summary={
        totalHours > 0 ? (
          <>
            {formatNumber(totalHours)} hours
            {byRole.length > 0 &&
              ` · ${byRole
                .map((entry) => `${entry.role} ${formatNumber(entry.hours)}h`)
                .join(" · ")}`}
          </>
        ) : undefined
      }
    >
      <MyGroup title="Applications" isEmpty={applications.length === 0}>
        {applications.map((row) => {
          const standing = volunteerApplicationStanding(row.status);
          return (
            <MyEntry
              key={row.id}
              // The role they said they were interested in, where they named
              // one. `role` carries `role_interest` for this kind.
              primary={row.role ?? "Application"}
              secondary={
                <ViewerTime
                  iso={row.occurred_at}
                  fallbackZone="UTC"
                  options={{ dateStyle: "medium" }}
                />
              }
              status={
                <MyStatus tone={standing.tone}>{standing.label}</MyStatus>
              }
            />
          );
        })}
      </MyGroup>

      <MyGroup title="Shifts" isEmpty={signups.length === 0}>
        {signups.map((row) => (
          <MyEntry
            key={row.id}
            primary={row.event_name ?? "An event"}
            secondary={
              <>
                <ViewerTime
                  iso={row.occurred_at}
                  fallbackZone={row.event_timezone ?? "UTC"}
                />
                {row.role && ` · ${row.role}`}
              </>
            }
          />
        ))}
      </MyGroup>

      <MyGroup title="Hours logged" isEmpty={hours.length === 0}>
        {hours.map((row) => (
          <MyEntry
            key={row.id}
            primary={`${formatNumber(row.hours)}h`}
            secondary={
              <>
                {formatCalendarDate(row.occurred_on)}
                {row.role && ` · ${row.role}`}
                {row.event_name && ` · ${row.event_name}`}
              </>
            }
          />
        ))}
      </MyGroup>

      {/* Hours the volunteer logged for themselves that nobody has confirmed
          yet (#1165). Shown, and shown apart from the total, for two reasons:
          an entry that vanishes on submit reads as a form that failed, and a
          provisional number counted in "42 hours" is the thing keeping it out
          of the ledger was meant to prevent. A declined entry stays here
          rather than disappearing, so the four hours a volunteer remembers
          logging have an answer on the screen built to give them one. */}
      <MyGroup title="Waiting on us" isEmpty={unconfirmedHours.length === 0}>
        {unconfirmedHours.map((row) => (
          <MyEntry
            key={row.id}
            primary={`${formatNumber(row.hours)}h`}
            secondary={
              <>
                {formatCalendarDate(row.occurred_on)}
                {row.role && ` · ${row.role}`}
                {row.event_name && ` · ${row.event_name}`}
              </>
            }
            status={
              row.status === "declined" ? (
                <MyStatus tone="closed">Not confirmed</MyStatus>
              ) : (
                <MyStatus tone="open">Awaiting review</MyStatus>
              )
            }
          />
        ))}
      </MyGroup>
    </MySection>
  );
}

/**
 * Money and goods, which are two modules as well as two tables -- so a tenant
 * that fundraises without running a library, or the other way round, sees one
 * group here and not the other. That happens in the database (each arm of
 * `my_giving_history()` is gated on its own module), which is why there is no
 * entitlement check in this file.
 */
function GivingSection({
  giving,
  vocabulary,
}: {
  giving: GivingHistory;
  vocabulary: Lexicon;
}) {
  return (
    <MySection
      title="Giving"
      summary={
        giving.monetaryTotal > 0
          ? `${formatCurrency(giving.monetaryTotal)} given`
          : undefined
      }
    >
      <MyGroup title="Money" isEmpty={giving.monetary.length === 0}>
        {giving.monetary.map((row) => (
          <MyEntry
            key={row.id}
            primary={formatCurrency(row.amount)}
            secondary={
              <>
                {formatCalendarDate(row.received_on)}
                {row.event_name && ` · ${row.event_name}`}
              </>
            }
          />
        ))}
      </MyGroup>

      {/* "Items given", not "Items": the gear section below is the tenant's
          word for its collection too, and two headings reading the same on a
          page this short is a reader's problem rather than a tidy one. */}
      <MyGroup
        title={`${vocabulary.item_plural ?? "Items"} given`}
        isEmpty={giving.inKind.length === 0}
      >
        {giving.inKind.map((row) => (
          <MyEntry
            key={row.id}
            primary={
              row.items?.join(", ") || formatCalendarDate(row.received_on)
            }
            secondary={
              <>
                {formatCalendarDate(row.received_on)}
                {row.event_name && ` · ${row.event_name}`}
              </>
            }
          />
        ))}
      </MyGroup>
    </MySection>
  );
}

/**
 * What you asked for and what you were handed, never merged: an open request
 * is not a receipt, and the person waiting on one is the reader least able to
 * afford that confusion.
 */
function GearSection({
  gear,
  vocabulary,
}: {
  gear: GearHistory;
  vocabulary: Lexicon;
}) {
  return (
    // The collection as the public site names it -- "Gear Library", "Tool
    // Library", "Food Pantry" -- because this section is about dealings with
    // that, not about a pile of items.
    <MySection title={vocabulary.collection_public ?? "Library"}>
      <MyGroup title="Requests" isEmpty={gear.requests.length === 0}>
        {gear.requests.map((row) => {
          const standing = gearRequestStanding(row.status);
          return (
            <MyEntry
              key={row.id}
              primary={row.items?.join(", ") || "Your request"}
              secondary={
                <>
                  <ViewerTime
                    iso={row.occurred_at}
                    fallbackZone="UTC"
                    options={{ dateStyle: "medium" }}
                  />
                  {row.delivery_method &&
                    ` · ${deliveryMethodLabel(row.delivery_method)}`}
                  {row.quoted_amount !== null &&
                    ` · ${formatCurrency(row.quoted_amount)} postage`}
                  {row.note && (
                    <span className="mt-1 block italic">“{row.note}”</span>
                  )}
                </>
              }
              status={
                <MyStatus tone={standing.tone}>{standing.label}</MyStatus>
              }
            />
          );
        })}
      </MyGroup>

      <MyGroup title="Received" isEmpty={gear.received.length === 0}>
        {gear.received.map((row) => (
          <MyEntry
            key={row.id}
            primary={row.items?.join(", ") || "An item"}
            secondary={
              <>
                <ViewerTime
                  iso={row.occurred_at}
                  fallbackZone="UTC"
                  options={{ dateStyle: "medium" }}
                />
                {row.quantity !== null &&
                  row.quantity > 1 &&
                  ` · ×${formatNumber(row.quantity)}`}
              </>
            }
          />
        ))}
      </MyGroup>
    </MySection>
  );
}
