export const VOLUNTEER_APPLICATION_STATUSES = [
  "new",
  "contacted",
  "placed",
  "declined",
  "closed",
] as const;
export type VolunteerApplicationStatus =
  (typeof VOLUNTEER_APPLICATION_STATUSES)[number];

export type VolunteerApplication = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role_interest: string | null;
  availability: string | null;
  status: VolunteerApplicationStatus;
  created_at: string;
};
