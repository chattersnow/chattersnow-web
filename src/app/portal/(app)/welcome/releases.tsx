import { ShoppingBag } from "lucide-react";
import type { DialogStep } from "./step-dialog";

/**
 * Release notes shown once to returning users, as a "what's new" dialog.
 *
 * To announce a release: bump CURRENT_RELEASE and replace RELEASE_NOTES with
 * that release's entries. Anyone whose last_release_seen is behind the new key
 * sees it on their next portal page load, once.
 *
 * Two rules keep this from becoming noise:
 *
 * 1. RELEASE_NOTES describes CURRENT_RELEASE and nothing else. It is not a
 *    changelog -- last_release_seen holds a single key, so a user away for
 *    three releases sees only the newest. Anything worth keeping belongs in
 *    the per-page help registry (help/help-content.tsx) instead.
 * 2. Leave RELEASE_NOTES empty for a release with nothing user-facing to say.
 *    The layout renders nothing at all when it's empty, and an empty or stale
 *    modal is worse than no modal.
 *
 * Keys are dates so they sort lexically, the same convention the migration
 * filenames use. Never lower CURRENT_RELEASE: mark_release_seen only ever
 * moves a user's pointer forward, so a downgrade silently shows no one
 * anything.
 */
export const CURRENT_RELEASE = "2026-09-11";

export const RELEASE_NOTES: DialogStep[] = [
  {
    key: "sales-register",
    icon: ShoppingBag,
    title: "Sell merchandise from the new Sales register",
    body: (
      <>
        <p>
          <strong>Finance &rsaquo; Sales</strong> now has a product catalog, a
          register for ringing up a sale, and a ledger of everything sold. The
          register prices each line from the catalog and takes the stock down as
          it goes; a sale you got wrong is voided, which puts its stock back and
          leaves the original on the record.
        </p>
        <p>
          Merchandise income is counted from those sales now, so{" "}
          <strong>Merchandise</strong> is no longer a source you can pick under
          Revenue. Rows recorded there before today keep their source and still
          count exactly once.
        </p>
      </>
    ),
  },
];
