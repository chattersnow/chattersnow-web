/**
 * Durations, storage and clock math for the portal's idle timeout (#617).
 *
 * Portal sessions otherwise never end: `jwt_expiry` is an hour, but the proxy
 * refreshes the session on every portal request and refresh tokens don't
 * expire, so a board member who signs in on a shared laptop and walks away
 * stays signed in on donor names, finances and people records indefinitely.
 *
 * Supabase's own answer -- `[auth.sessions]` `timebox` / `inactivity_timeout`
 * in supabase/config.toml -- is Pro-plan only and this project runs on free
 * tiers, so the enforcement has to be client-side. When the plan changes, turn
 * those on as the real enforcement and keep this as the walked-away guard.
 *
 * Deliberately React-free: every clock decision lives here as a pure function
 * so the boundaries can be tested without timers, a DOM, or a rendered tree.
 */

const DEFAULT_IDLE_MINUTES = 30;
const DEFAULT_WARNING_MINUTES = 2;

/**
 * Reads a minutes-valued env override, falling back on anything that isn't a
 * usable positive number. The overrides exist so the timeout can be exercised
 * by hand in seconds rather than half an hour; `NEXT_PUBLIC_*` is inlined at
 * build time, so changing one needs a dev-server restart.
 */
function minutesFromEnv(raw: string | undefined, fallbackMinutes: number) {
  const parsed = Number(raw);
  const minutes =
    Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMinutes;
  return Math.round(minutes * 60_000);
}

/** How long without activity before the session ends. */
export const IDLE_TIMEOUT_MS = minutesFromEnv(
  process.env.NEXT_PUBLIC_PORTAL_IDLE_MINUTES,
  DEFAULT_IDLE_MINUTES,
);

/**
 * How long the "Still there?" warning is on screen before the sign-out lands.
 * Clamped below the timeout so a misconfigured override can't put the warning
 * before the session has even started.
 */
export const IDLE_WARNING_MS = Math.min(
  minutesFromEnv(
    process.env.NEXT_PUBLIC_PORTAL_IDLE_WARNING_MINUTES,
    DEFAULT_WARNING_MINUTES,
  ),
  IDLE_TIMEOUT_MS,
);

/**
 * How often activity reaches storage. Every pointer move counts as activity in
 * memory, but only one write per interval is persisted: a synchronous,
 * cross-tab-notifying write on every mousemove would be a real performance
 * problem. A stamp up to this stale against a 30-minute budget signs someone
 * out at most a fraction of a percent early.
 */
export const ACTIVITY_WRITE_INTERVAL_MS = 15_000;

/**
 * Shared across tabs, so activity in one portal tab keeps the others alive and
 * nobody is signed out of a window they were actively using. Namespaced like
 * the other portal keys (see inventory-view-context).
 */
export const LAST_ACTIVITY_KEY = "chattersnow:portal-last-activity";

/**
 * Written on the way out so other tabs follow immediately.
 *
 * Supabase does broadcast `SIGNED_OUT` across tabs over a BroadcastChannel,
 * and that stays as the belt-and-braces path, but it isn't available in every
 * context and the session itself lives in cookies (which never raise `storage`
 * events). This key is the cheap, explicit signal, since a `storage` listener
 * is already here for the keep-alive.
 */
export const SIGNED_OUT_KEY = "chattersnow:portal-signed-out";

/** Marks a login redirect as "we ended this session", not "you logged out". */
export const IDLE_SIGNOUT_REASON = "idle";

export type IdlePhase = "active" | "warning" | "expired";

export type IdleDurations = {
  idleMs?: number;
  warningMs?: number;
};

function resolve({ idleMs, warningMs }: IdleDurations = {}) {
  const idle = idleMs ?? IDLE_TIMEOUT_MS;
  return { idle, warning: Math.min(warningMs ?? IDLE_WARNING_MS, idle) };
}

/**
 * Where a session stands, derived fresh from the clock every time rather than
 * tracked as state. A timer firing is only ever a prompt to re-read the clock,
 * so a timer that fired late (background-tab clamping) or not at all (the
 * laptop slept) can't hand out extra session time.
 */
export function idlePhaseAt(
  lastActivity: number,
  now: number,
  durations?: IdleDurations,
): IdlePhase {
  const { idle, warning } = resolve(durations);
  const elapsed = now - lastActivity;
  // Negative elapsed means a stamp from a tab whose clock runs fast. Treat it
  // as fresh rather than letting it read as an expiry.
  if (elapsed >= idle) return "expired";
  if (elapsed >= idle - warning) return "warning";
  return "active";
}

/** How long until the phase changes; 0 once expired. Never negative. */
export function msUntilNextIdleTransition(
  lastActivity: number,
  now: number,
  durations?: IdleDurations,
): number {
  const { idle, warning } = resolve(durations);
  const phase = idlePhaseAt(lastActivity, now, durations);
  if (phase === "expired") return 0;
  const target = lastActivity + (phase === "warning" ? idle : idle - warning);
  return Math.max(0, target - now);
}

/**
 * `m:ss` for the countdown. Rounds up, so the last second reads "0:01" and the
 * dialog never sits on "0:00" looking hung while it waits to sign out.
 */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total - minutes * 60).padStart(2, "0")}`;
}

/**
 * Last activity across all tabs, or null when storage has nothing usable.
 *
 * The validation isn't defensive padding: `Number(null)` is 0, which would
 * read as a 1970 stamp and sign every tab out instantly, and a NaN stamp turns
 * `setTimeout(fn, NaN)` into a next-tick spin loop. Storage can also throw
 * outright (private browsing, site data blocked), and the timeout has to keep
 * working in memory when it does.
 */
export function parseActivityStamp(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const stamp = Number(raw);
  return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
}

export function readLastActivity(): number | null {
  if (typeof window === "undefined") return null;
  try {
    return parseActivityStamp(window.localStorage.getItem(LAST_ACTIVITY_KEY));
  } catch {
    return null;
  }
}

export function writeLastActivity(at: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // ignore storage failures (private browsing, disabled storage, etc.)
  }
}

/**
 * Announces a sign-out to the other tabs and drops the activity stamp, so the
 * next session starts from a clean slate rather than inheriting a stale one.
 */
export function broadcastSignOut(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
    window.localStorage.setItem(SIGNED_OUT_KEY, String(Date.now()));
  } catch {
    // ignore storage failures (private browsing, disabled storage, etc.)
  }
}
