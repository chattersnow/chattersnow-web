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

export type QueryError = { message: string; code?: string };

export type RpcAnswer = {
  data?: unknown;
  error?: QueryError | null;
};

/**
 * What one table answers for one kind of statement. `data` is always written
 * as the row list; `.single()`/`.maybeSingle()` take the first row, exactly as
 * PostgREST does.
 */
export type TableAnswer = {
  rows?: unknown[];
  error?: QueryError | null;
};

export type FakeSupabaseOptions = {
  /** null models a signed-out session, which `checkUser` turns into an error. */
  userId?: string | null;
  /** Resource key -> level, as `my_permissions` would return them. */
  permissions?: Record<string, PermissionLevel>;
  /** Canned answers by RPC name. Anything unnamed answers `{ data: null }`. */
  rpc?: Record<string, RpcAnswer>;
  /** Canned answers by table for `.select()`. */
  select?: Record<string, TableAnswer>;
  /** Canned answers by table for `.insert()`. */
  insert?: Record<string, TableAnswer>;
  /** Canned answers by table for `.update()`. */
  update?: Record<string, TableAnswer>;
  /** Canned error for every update path. Shorthand that predates `update`. */
  updateError?: QueryError | null;
};

export type QueryFilter = { method: string; args: unknown[] };

export type RecordedQuery = {
  table: string;
  operation: "select" | "insert" | "update" | "delete";
  values: unknown;
  filters: QueryFilter[];
};

export type FakeSupabase = {
  client: import("@supabase/supabase-js").SupabaseClient;
  /** Every rpc() the core made, in order. */
  rpcCalls: RpcCall[];
  /**
   * Every from(...).update(...) the core ran, in order, in the shape this
   * helper has always reported: the first `.eq()` flattened out. `statements`
   * below is the same run with every filter on it.
   */
  updates: {
    table: string;
    values: unknown;
    eqColumn: string;
    eqValue: unknown;
  }[];
  /** Every statement the core ran, in order, with all of its filters. */
  statements: RecordedQuery[];
};

/** Chainable filter/modifier methods that only ever narrow; the fake records them. */
const PASSTHROUGH = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "not",
  "or",
  "order",
  "limit",
  "range",
  "select",
] as const;

export function fakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const {
    userId = "user-1",
    permissions = {},
    rpc: answers = {},
    updateError = null,
  } = options;

  const rpcCalls: RpcCall[] = [];
  const updates: FakeSupabase["updates"] = [];
  const statements: RecordedQuery[] = [];

  const permissionRows = Object.entries(permissions).map(
    ([resource_key, level]) => ({ resource_key, level }),
  );

  function answerFor(
    table: string,
    operation: RecordedQuery["operation"],
  ): TableAnswer {
    if (operation === "select") return options.select?.[table] ?? {};
    if (operation === "insert") return options.insert?.[table] ?? {};
    if (operation === "update") {
      return options.update?.[table] ?? { error: updateError };
    }
    return {};
  }

  function builder(
    table: string,
    operation: RecordedQuery["operation"],
    values: unknown,
  ) {
    const filters: QueryFilter[] = [];
    let recorded = false;

    // Recorded when the statement is actually run, not when a filter is added,
    // so a test reads exactly the statements the core sent.
    const record = () => {
      if (recorded) return;
      recorded = true;
      statements.push({ table, operation, values, filters });
      if (operation === "update") {
        const firstEq = filters.find((filter) => filter.method === "eq");
        updates.push({
          table,
          values,
          eqColumn: (firstEq?.args[0] as string) ?? "",
          eqValue: firstEq?.args[1],
        });
      }
    };

    const settle = (shape: "many" | "single" | "maybe") => {
      record();
      const answer = answerFor(table, operation);
      const error = answer.error ?? null;
      const rows = answer.rows ?? [];
      if (error) return Promise.resolve({ data: null, error });
      if (shape === "many") return Promise.resolve({ data: rows, error: null });
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    };

    const chain: Record<string, unknown> = {
      single: () => settle("single"),
      maybeSingle: () => settle("maybe"),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => settle("many").then(resolve, reject),
    };

    for (const method of PASSTHROUGH) {
      chain[method] = (...args: unknown[]) => {
        filters.push({ method, args });
        return chain;
      };
    }

    return chain;
  }

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
        select: (...args: unknown[]) => {
          const chain = builder(table, "select", undefined) as Record<
            string,
            (...a: unknown[]) => unknown
          >;
          return chain.select(...args);
        },
        insert: (values: unknown) => builder(table, "insert", values),
        update: (values: unknown) => builder(table, "update", values),
        delete: () => builder(table, "delete", undefined),
      };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { client, rpcCalls, updates, statements };
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
