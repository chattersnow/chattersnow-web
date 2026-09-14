import type { SupabaseClient as GenericSupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

/** Anything a `jsonb` column can hold, as the generator words it. */
export type { Json };

/*
 * `src/lib/database.types.ts` is written by `supabase gen types typescript`
 * from the migrations (`bun run db:types`, checked in CI). It is the source of
 * truth for column names and types, and it replaces the hand-written shapes
 * that used to sit at each call site (#813 Phase 1).
 *
 * Three of its conventions are wrong about Postgres rather than wrong about
 * this schema, and each is corrected once below instead of at a hundred call
 * sites: nullable function arguments, trigger-filled columns, and the
 * `not null` a view drops.
 */

/**
 * **Every function parameter accepts NULL.**
 *
 * The generator marks a parameter optional when it has a default and required
 * otherwise, and types neither as nullable. Postgres does not work that way: a
 * parameter with no default must be *supplied*, but `null` is a value like any
 * other, and several of the intake RPCs are written to take it --
 * `submit_volunteer_application(p_phone text, ...)` stores null for an
 * applicant who left the field blank, which is exactly what the form sends.
 *
 * Widening here rather than writing `?? undefined` at each call keeps the
 * distinction the database makes: an omitted argument takes the parameter's
 * default, an explicit null stores null, and for a parameter defaulting to
 * null those two happen to agree. Turning the nulls into `undefined` would
 * silently stop agreeing the day a default is anything else.
 */
type NullableArgs<F> = {
  [Name in keyof F]: F[Name] extends { Args: infer A }
    ? Omit<F[Name], "Args"> & { Args: { [P in keyof A]: A[P] | null } }
    : F[Name];
};

/**
 * **Three tables fill `tenant_id` from a trigger, not a column default.**
 *
 * 90 of the 98 `tenant_id` columns default to `default_tenant_id()`, which the
 * generator reads and duly marks optional on insert. `user_roles`,
 * `role_permissions` and `pending_role_grants` instead derive the tenant from
 * the role being granted, in a `before insert` trigger
 * (`set_tenant_id_from_role()`) -- a default could only name the caller's
 * tenant, and these three rows belong to the role's. The generator cannot see
 * a trigger, so it calls the column required and every existing insert looks
 * broken. They are not: the trigger has filled the column since the migration
 * that added it.
 */
type TriggerFilledTenantId =
  "user_roles" | "role_permissions" | "pending_role_grants";

type OptionalTenantId<T> = T extends { Insert: infer I }
  ? Omit<T, "Insert"> & {
      Insert: Omit<I, "tenant_id"> & {
        tenant_id?: I extends { tenant_id: infer V } ? V : never;
      };
    }
  : T;

type TablesWithTriggerDefaults<T> = {
  [Name in keyof T]: Name extends TriggerFilledTenantId
    ? OptionalTenantId<T[Name]>
    : T[Name];
};

type CorrectedSchema<S> = Omit<S, "Functions" | "Tables"> & {
  Functions: NullableArgs<S extends { Functions: infer F } ? F : never>;
  Tables: TablesWithTriggerDefaults<S extends { Tables: infer T } ? T : never>;
};

export type Db = Omit<Database, "public"> & {
  public: CorrectedSchema<Database["public"]>;
};

/** A Supabase client that knows this project's schema. */
export type SupabaseClient = GenericSupabaseClient<Db>;

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

export type FunctionReturns<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]["Returns"];

/**
 * **A view's columns are all nullable, whatever its base tables say.**
 *
 * Postgres does not carry `not null` through a view definition, so every
 * column of every `public_*` view comes back as `T | null` however the column
 * under it is declared. Narrowing the ones that cannot be null keeps that
 * fiction out of the components: without it a `PublicEvent.name` is
 * `string | null` all the way down to the heading that renders it, and the
 * null branch is dead code nobody can exercise.
 *
 * Use it only for columns the view projects straight from a `not null` base
 * column. A column that is genuinely nullable -- or one behind a left join,
 * which the view's own SQL makes nullable -- must stay nullable.
 */
export type NonNullColumns<Row, K extends keyof Row> = Omit<Row, K> & {
  [P in K]-?: NonNullable<Row[P]>;
};
