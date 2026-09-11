import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * The volunteer pages have a slot of their own (#902) so the Volunteers module
 * can gate them without taking Attend and Become a Partner down with them --
 * neither of those is about volunteers. A layout rather than a `gate` on the
 * page, because the status lookup at /volunteer/status sits beneath it and has
 * to go too.
 *
 * No PageShell: the parent Get Involved layout already provides it.
 */
export default async function VolunteerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("get-involved-volunteer");
  return <>{children}</>;
}
