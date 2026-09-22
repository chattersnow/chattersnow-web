import type { PermissionMap } from "@/lib/auth/permissions";
import type { Lexicon } from "@/lib/lexicon";
import type { Branding } from "@/lib/branding";
import type { EnsuredPerson } from "@/lib/auth/current-person";
import type { PendingApprovalItem } from "@/lib/portal/attention-items";
import type { TenantContext } from "@/lib/portal/tenants";

/**
 * Everything both portal shells render from (#1079).
 *
 * The layout does all the work -- the signed-in guard, tenant resolution,
 * permissions, the `Promise.all` over the attention summaries, branding and
 * lexicon -- and then hands the result to exactly one of the two shells. That
 * work is the expensive part of every portal navigation and must not fork;
 * only the returned tree does, so only one shell's components ship to any
 * given device.
 */
export type PortalShellProps = {
  /**
   * The paths the portal's service worker may control on this host (#1171).
   * Resolved by the layout, which is the half of the render that can see the
   * request host, and passed down rather than re-derived in the browser.
   */
  serviceWorkerScope: string;
  permissions: PermissionMap;
  lexicon: Lexicon;
  branding: Branding;
  currentPerson: EnsuredPerson | null;
  attentionItems: PendingApprovalItem[];
  /**
   * The legal documents this organization serves, for the shell's footer
   * (#687). Resolved by the layout rather than by each shell, and only ever
   * the documents actually in force: linking a document nobody has adopted
   * would send staff to a 404, because #859 takes the route away as well as
   * the public footer link.
   */
  legalLinks: { label: string; href: string }[];
  tenantContext: TenantContext;
  /** True when the host pinned the tenant, so the switcher is read-only. */
  hostPinned: boolean;
  isDemo: boolean;
  /** The reader's preferred name, already resolved the portal's usual way. */
  displayName: string;
  welcomeOwed: boolean;
  whatsNewOwed: boolean;
  children: React.ReactNode;
};
