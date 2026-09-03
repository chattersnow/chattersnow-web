import type { Metadata } from "next";
import { detailTitle } from "@/lib/portal/detail-title";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonListItem } from "../actions";
import { type OrganizationMembership, type PersonRow } from "../people-shared";
import { ProfileCard } from "./profile-card";
import { OrganizationsCard } from "./organizations-card";
import {
  formatCalendarDate,
  formatCurrency,
  formatInstantDate,
} from "@/lib/format";

function contributionSuffix(value: number | string | null) {
  const amount = formatCurrency(value, "");
  return amount ? ` · ${amount}` : "";
}

type EventRef = { id: string; name: string; starts_at: string | null } | null;

type Donation = {
  id: string;
  donated_at: string;
  notes: string | null;
  event: EventRef;
};
type Sponsorship = {
  id: string;
  support_type: string;
  contribution_value: number | string | null;
  is_public: boolean;
  event: EventRef;
};
type Registration = {
  id: string;
  party_size: number;
  created_at: string;
  checked_in_at: string | null;
  event: EventRef;
};
type VolunteerSignup = { id: string; role: string | null; event: EventRef };
type VolunteerHoursEntry = {
  id: string;
  hours: number;
  logged_date: string;
  notes: string | null;
  event: EventRef;
};
type VolunteerApplication = {
  id: string;
  status: string;
  role_interest: string | null;
  created_at: string;
};
type PartnershipAsOrg = {
  id: string;
  stage: string;
  next_step_date: string | null;
};
type PartnershipAsOwner = {
  id: string;
  stage: string;
  next_step_date: string | null;
  organization: { id: string; name: string | null } | null;
};
type ContactFor = { id: string; name: string | null; email: string | null };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: await detailTitle({
      table: "people",
      column: "name",
      id: id,
      fallback: "Person",
    }),
  };
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "people", "manage");

  const { data: person } = await supabase
    .from("people")
    .select(
      "id, name, email, phone, instagram_handle, notes, logo_url, website, is_donor, is_sponsor, is_volunteer, is_organization, is_attendee, riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain, primary_contact_person_id, primary_contact:primary_contact_person_id(id, name, email, phone)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!person) notFound();
  const personRow = person as unknown as PersonRow;

  const [
    { data: peopleOptions },
    { data: organizationMemberships },
    { data: donations },
    { data: sponsorships },
    { data: registrations },
    { data: volunteerSignups },
    { data: volunteerHours },
    { data: volunteerApplications },
    { data: partnershipsAsOrg },
    { data: partnershipsAsOwner },
    { data: contactFor },
  ] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, name, preferred_name, email, phone, is_sponsor, is_organization, auth_user_id",
      )
      .neq("id", id)
      .order("name", { ascending: true }),
    supabase
      .from("person_organizations")
      .select(
        "id, role, is_primary, organization:people!organization_id(id, name, preferred_name, email, phone), person:people!person_id(id, name, preferred_name, email, phone)",
      )
      .eq(personRow.is_organization ? "organization_id" : "person_id", id),
    supabase
      .from("donations")
      .select("id, donated_at, notes, event:events(id, name, starts_at)")
      .eq("donor_id", id)
      .order("donated_at", { ascending: false }),
    supabase
      .from("event_sponsors")
      .select(
        "id, support_type, contribution_value, is_public, event:events(id, name, starts_at)",
      )
      .eq("person_id", id),
    supabase
      .from("event_registrations")
      .select(
        "id, party_size, created_at, checked_in_at, event:events(id, name, starts_at)",
      )
      .eq("person_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("event_volunteers")
      .select("id, role, event:events(id, name, starts_at)")
      .eq("person_id", id),
    supabase
      .from("volunteer_hours")
      .select(
        "id, hours, logged_date, notes, event:events(id, name, starts_at)",
      )
      .eq("person_id", id)
      .order("logged_date", { ascending: false }),
    supabase
      .from("volunteer_applications")
      .select("id, status, role_interest, created_at")
      .eq("person_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("partnership_opportunities")
      .select("id, stage, next_step_date")
      .eq("organization_person_id", id),
    supabase
      .from("partnership_opportunities")
      .select(
        "id, stage, next_step_date, organization:people!organization_person_id(id, name, preferred_name)",
      )
      .eq("owner_person_id", id),
    supabase
      .from("people")
      .select("id, name, email")
      .eq("primary_contact_person_id", id),
  ]);

  const peopleOptionRows = (peopleOptions ?? []) as unknown as PersonListItem[];
  const organizationMembershipRows = (organizationMemberships ??
    []) as unknown as OrganizationMembership[];
  const donationRows = (donations ?? []) as unknown as Donation[];
  const sponsorshipRows = (sponsorships ?? []) as unknown as Sponsorship[];
  const registrationRows = (registrations ?? []) as unknown as Registration[];
  const volunteerSignupRows = (volunteerSignups ??
    []) as unknown as VolunteerSignup[];
  const volunteerHoursRows = (volunteerHours ??
    []) as unknown as VolunteerHoursEntry[];
  const volunteerApplicationRows = (volunteerApplications ??
    []) as unknown as VolunteerApplication[];
  const partnershipAsOrgRows = (partnershipsAsOrg ??
    []) as unknown as PartnershipAsOrg[];
  const partnershipAsOwnerRows = (partnershipsAsOwner ??
    []) as unknown as PartnershipAsOwner[];
  const contactForRows = (contactFor ?? []) as unknown as ContactFor[];

  const totalVolunteerHours = volunteerHoursRows.reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );
  const attendedEventCount = registrationRows.filter(
    (registration) => registration.checked_in_at !== null,
  ).length;

  return (
    <>
      <PortalBreadcrumbs current={personRow.name ?? "Person"} />

      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {personRow.name ?? "—"}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      {contactForRows.length > 0 && (
        <div className="app-muted mt-3 flex flex-col gap-1 text-sm">
          {contactForRows.map((org) => (
            <p key={org.id}>
              Contact for:{" "}
              <Link
                href={`/portal/people/${org.id}`}
                className="underline underline-offset-2"
              >
                {org.name ?? "—"}
              </Link>
            </p>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ProfileCard
          person={personRow}
          people={peopleOptionRows}
          canManage={canManage}
        />

        <OrganizationsCard
          personId={personRow.id}
          isOrganization={personRow.is_organization}
          memberships={organizationMembershipRows}
          people={peopleOptionRows}
          canManage={canManage}
        />

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Donations ({donationRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {donationRows.length === 0 ? (
              <p className="app-muted text-sm">No donations recorded.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {donationRows.map((donation) => (
                  <li
                    key={donation.id}
                    className="border-b border-[var(--line)] pb-2 last:border-0 last:pb-0"
                  >
                    <p className="font-medium">
                      {formatInstantDate(donation.donated_at)}
                      {donation.event?.name ? ` · ${donation.event.name}` : ""}
                    </p>
                    {donation.notes && (
                      <p className="app-muted">{donation.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Sponsorships ({sponsorshipRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sponsorshipRows.length === 0 ? (
              <p className="app-muted text-sm">No sponsorships recorded.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {sponsorshipRows.map((sponsorship) => (
                  <li
                    key={sponsorship.id}
                    className="border-b border-[var(--line)] pb-2 last:border-0 last:pb-0"
                  >
                    <p className="font-medium">
                      {sponsorship.event?.name ?? "—"}
                    </p>
                    <p className="app-muted capitalize">
                      {sponsorship.support_type.replace("_", " ")}
                      {contributionSuffix(sponsorship.contribution_value)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Event registrations ({registrationRows.length}) · Attended{" "}
              {attendedEventCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {registrationRows.length === 0 ? (
              <p className="app-muted text-sm">No event registrations.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {registrationRows.map((registration) => (
                  <li
                    key={registration.id}
                    className="border-b border-[var(--line)] pb-2 last:border-0 last:pb-0"
                  >
                    <p className="font-medium">
                      {registration.event?.name ?? "—"}
                      {registration.checked_in_at && (
                        <span className="app-muted font-normal">
                          {" "}
                          · Attended
                        </span>
                      )}
                    </p>
                    <p className="app-muted">
                      Party of {registration.party_size} ·{" "}
                      {formatInstantDate(registration.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Volunteer activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {volunteerSignupRows.length === 0 &&
            volunteerHoursRows.length === 0 &&
            volunteerApplicationRows.length === 0 ? (
              <p className="app-muted text-sm">
                No volunteer activity recorded.
              </p>
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                {volunteerApplicationRows.length > 0 && (
                  <div>
                    <p className="app-muted mb-1 text-xs font-semibold uppercase tracking-[0.1em]">
                      Applications
                    </p>
                    <ul className="flex flex-col gap-2">
                      {volunteerApplicationRows.map((application) => (
                        <li key={application.id}>
                          {formatInstantDate(application.created_at)} ·{" "}
                          <span className="capitalize">
                            {application.status}
                          </span>
                          {application.role_interest
                            ? ` · ${application.role_interest}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {volunteerSignupRows.length > 0 && (
                  <div>
                    <p className="app-muted mb-1 text-xs font-semibold uppercase tracking-[0.1em]">
                      Event sign-ups
                    </p>
                    <ul className="flex flex-col gap-2">
                      {volunteerSignupRows.map((signup) => (
                        <li key={signup.id}>
                          {signup.event?.name ?? "—"}
                          {signup.role ? ` · ${signup.role}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {volunteerHoursRows.length > 0 && (
                  <div>
                    <p className="app-muted mb-1 text-xs font-semibold uppercase tracking-[0.1em]">
                      Hours logged ({totalVolunteerHours})
                    </p>
                    <ul className="flex flex-col gap-2">
                      {volunteerHoursRows.map((entry) => (
                        <li key={entry.id}>
                          {formatCalendarDate(entry.logged_date)} ·{" "}
                          {entry.hours}h
                          {entry.event?.name ? ` · ${entry.event.name}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Partnerships
            </CardTitle>
          </CardHeader>
          <CardContent>
            {partnershipAsOrgRows.length === 0 &&
            partnershipAsOwnerRows.length === 0 ? (
              <p className="app-muted text-sm">No partnership involvement.</p>
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                {partnershipAsOrgRows.length > 0 && (
                  <div>
                    <p className="app-muted mb-1 text-xs font-semibold uppercase tracking-[0.1em]">
                      As the partner organization
                    </p>
                    <ul className="flex flex-col gap-2">
                      {partnershipAsOrgRows.map((opportunity) => (
                        <li key={opportunity.id} className="capitalize">
                          {opportunity.stage.replace("_", " ")}
                          {opportunity.next_step_date
                            ? ` · next step ${formatCalendarDate(opportunity.next_step_date)}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {partnershipAsOwnerRows.length > 0 && (
                  <div>
                    <p className="app-muted mb-1 text-xs font-semibold uppercase tracking-[0.1em]">
                      As internal owner
                    </p>
                    <ul className="flex flex-col gap-2">
                      {partnershipAsOwnerRows.map((opportunity) => (
                        <li key={opportunity.id}>
                          {opportunity.organization?.name ?? "—"} ·{" "}
                          <span className="capitalize">
                            {opportunity.stage.replace("_", " ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
