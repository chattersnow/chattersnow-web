import { requireConstituentArea } from "@/lib/constituent/guard";

/**
 * The constituent area's own gate (#1161).
 *
 * Only the module is checked here, not the session: `/my/sign-in` is a child
 * of this layout and has to be reachable signed out, so a redirect at this
 * level would bounce a visitor into the page that was trying to serve them.
 * Each page below decides for itself, through `requireConstituentSession()`.
 *
 * This nests inside the public layout, so the area keeps the organization's
 * own header, footer and branding. That is the point: this is the tenant's
 * website, not a second application -- and not the portal, which requires a
 * role that nobody here has.
 */
export default async function MyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireConstituentArea();
  return children;
}
