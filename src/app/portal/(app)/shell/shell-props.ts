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
  permissions: PermissionMap;
  lexicon: Lexicon;
  branding: Branding;
  currentPerson: EnsuredPerson | null;
  attentionItems: PendingApprovalItem[];
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
