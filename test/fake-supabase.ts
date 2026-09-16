// A hand-rolled Supabase client for unit tests of the Next-free action cores
// (#1082 Phase 1). Deliberately not a mocking framework: a core's contract is
// "given this session and these permissions, which RPC does it call and with
// what", so the fake records calls and replays canned answers, and a test
// reads as that sentence.
//
// Anything that needs a real policy or a real RPC body belongs in an
// *.integration.test.ts against a live stack instead -- these tests can only
// ever prove what the TypeScript does.
import type { PermissionLevel } from "@/lib/auth/permissions";

export type RpcCall = { name: string; args: unknown };

export type RpcAnswer = {
  data?: unknown;
  error?: { message: string } | null;
};

export type FakeSupabaseOptions = {
  /** null models a signed-out session, which `checkUser` turns into an error. */
  userId?: string | null;
  /** Resource key -> level, as `my_permissions` would return them. */
  permissions?: Record<string, PermissionLevel>;
  /** Canned answers by RPC name. Anything unnamed answers `{ data: null }`. */
  rpc?: Record<string, RpcAnswer>;
  /** Canned error for the `event_registrations` update path. */
  updateError?: { message: string } | null;
};

export type FakeSupabase = {
  client: import("@supabase/supabase-js").SupabaseClient;
  /** Every rpc() the core made, in order. */
  rpcCalls: RpcCall[];
  /** Every from(...).update(...) the core made, in order. */
  updates: {
    table: string;
    values: unknown;
    eqColumn: string;
    eqValue: unknown;
  }[];
};

export function fakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const {
    userId = "user-1",
    permissions = {},
    rpc: answers = {},
    updateError = null,
  } = options;

  const rpcCalls: RpcCall[] = [];
  const updates: FakeSupabase["updates"] = [];

  const permissionRows = Object.entries(permissions).map(
    ([resource_key, level]) => ({ resource_key, level }),
  );

  const client = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: userId ? { id: userId } : null },
          error: null,
        }),
    },
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      if (name === "my_permissions") {
        return Promise.resolve({ data: permissionRows, error: null });
      }
      const answer = answers[name];
      return Promise.resolve({
        data: answer?.data ?? null,
        error: answer?.error ?? null,
      });
    },
    from(table: string) {
      return {
        update(values: unknown) {
          return {
            eq(eqColumn: string, eqValue: unknown) {
              updates.push({ table, values, eqColumn, eqValue });
              return Promise.resolve({ data: null, error: updateError });
            },
          };
        },
      };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { client, rpcCalls, updates };
}

/** The RPC names every permission check makes, which tests ignore. */
export const PERMISSION_RPCS = [
  "has_tenant_membership",
  "claim_pending_role_grants",
  "my_permissions",
];

/** The calls a core made that were its own, not the permission preamble. */
export function domainRpcCalls(calls: RpcCall[]): RpcCall[] {
  return calls.filter((call) => !PERMISSION_RPCS.includes(call.name));
}
