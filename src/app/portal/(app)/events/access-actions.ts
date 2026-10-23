"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkAnyPermission, checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  EVENT_ACCESS_AREAS,
  getEventAccessAreaOptions,
} from "@/lib/auth/event-access";
import { mintInviteLink } from "@/lib/auth/invite-link";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendEventAccessNotice } from "@/lib/notifications/event-access-notification";
import type { PortalUser } from "../administration/users/users-shared";
import {
  eventAccessErrorMessage,
  type EventAccessCandidate,
  type EventAccessEntry,
  type EventAccessInput,
  type EventAccessState,
} from "./event-access-shared";

/**
 * Per-event access (#1689): the Access card on an event. Who has access is
 * readable with `events: manage`; giving, changing and removing it is
 * `administration: manage` only (#1685). The database enforces both --
 * list_event_access() and the grant tables' policies -- and these checks are
 * what make a refusal read as a sentence.
 */

type Result = { error: string } | { success: true };

const ADMIN_ONLY =
  "Only an administrator can give or change access to an event.";

const DEMO_MESSAGE = "Event access is turned off in the demo.";

function eventPath(eventId: string): string {
  return `/portal/events/${eventId}`;
}

function cleanInput(input: EventAccessInput): EventAccessInput | null {
  if (input.level !== "view" && input.level !== "manage") return null;
  const areas = EVENT_ACCESS_AREAS.filter((area) => input.areas.includes(area));
  return areas.length > 0 ? { level: input.level, areas } : null;
}

export async function getEventAccessAction(
  eventId: string,
): Promise<{ data: EventAccessState } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkAnyPermission(supabase, [
    { resource: "events", level: "manage" },
    { resource: "administration", level: "manage" },
  ]);
  if (denied) return denied;

  const [{ data: entries, error }, areas, canGrant] = await Promise.all([
    supabase.rpc("list_event_access", { p_event_id: eventId }),
    getEventAccessAreaOptions(supabase),
    checkPermission(supabase, "administration", "manage").then(
      (result) => result === null,
    ),
  ]);
  if (error || !areas) {
    return { error: "Could not load who has access. Please try again." };
  }
  return {
    data: {
      entries: (entries ?? []) as EventAccessEntry[],
      areas,
      canGrant,
    },
  };
}

/** The organization's active accounts, for the "existing account" picker. */
export async function listEventAccessCandidatesAction(): Promise<
  { data: EventAccessCandidate[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(
    supabase,
    "administration",
    "manage",
    ADMIN_ONLY,
  );
  if (denied) return denied;

  const { data, error } = await supabase.rpc("list_portal_users");
  if (error) return { error: "Could not load accounts. Please try again." };
  return {
    data: ((data ?? []) as PortalUser[])
      .filter((user) => user.email && !user.deactivated_at)
      .map((user) => ({
        user_id: user.user_id,
        email: user.email as string,
        name: user.preferred_name || user.person_name || user.full_name,
      })),
  };
}

async function inDemoTenant(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.rpc("current_tenant_is_demo");
  return data === true;
}

/**
 * Give someone access to an event: an account in the organization (picked, or
 * found by the address typed), or an invite to an address with none. An
 * invite goes through the organization's normal provisioning -- a staged row
 * claimed at first sign-in, and a sign-in link minted for the address -- and
 * the person is emailed either way.
 */
export async function grantEventAccessAction(
  eventId: string,
  who: { userId: string } | { email: string },
  rawInput: EventAccessInput,
): Promise<Result & { emailed?: boolean }> {
  const input = cleanInput(rawInput);
  if (!input) return { error: "Pick a level and at least one area." };

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const denied = await checkPermission(
    supabase,
    "administration",
    "manage",
    ADMIN_ONLY,
  );
  if (denied) return denied;
  if (await inDemoTenant(supabase)) return { error: DEMO_MESSAGE };

  const [{ data: event }, { data: users, error: usersError }, areas] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, name, tenant_id")
        .eq("id", eventId)
        .maybeSingle(),
      supabase.rpc("list_portal_users"),
      getEventAccessAreaOptions(supabase),
    ]);
  if (!event) return { error: "This event no longer exists." };
  if (usersError || !areas) {
    return { error: "Could not give access. Please try again." };
  }

  const accounts = (users ?? []) as PortalUser[];
  const typed = "email" in who ? who.email.trim().toLowerCase() : null;
  if (typed !== null && !/^[^\s@]+@[^\s@]+$/.test(typed)) {
    return { error: "Enter a valid email address." };
  }
  const account =
    "userId" in who
      ? accounts.find((user) => user.user_id === who.userId)
      : accounts.find((user) => user.email?.toLowerCase() === typed);
  if ("userId" in who && !account) {
    return { error: "That account isn't in this organization." };
  }
  const me = accounts.find((user) => user.user_id === userResult.user.id);
  const grantedBy =
    me?.preferred_name || me?.person_name || me?.full_name || null;

  let grantId: string;
  let to: string;
  let inviteLink: string | null = null;

  if (account) {
    const { data, error } = await supabase
      .from("event_access_grants")
      .insert({
        event_id: eventId,
        user_id: account.user_id,
        level: input.level,
        areas: input.areas,
        granted_by: userResult.user.id,
      })
      .select("id")
      .single();
    if (error) {
      return {
        error:
          error.code === "23505"
            ? "They already have access to this event. Change it in the list instead."
            : eventAccessErrorMessage(
                error.message,
                "Could not give access. Please try again.",
              ),
      };
    }
    grantId = data.id;
    to = account.email as string;
  } else {
    const email = typed as string;
    const { data, error } = await supabase
      .from("pending_event_access_grants")
      .insert({
        event_id: eventId,
        email,
        level: input.level,
        areas: input.areas,
      })
      .select("id")
      .single();
    if (error) {
      // 42501: the address rule (#759) in the insert policy.
      return {
        error:
          error.code === "23505"
            ? "That address is already invited to this event."
            : error.code === "42501"
              ? "That address already has an account that is not this organization's, so it can't be invited here."
              : eventAccessErrorMessage(
                  error.message,
                  "Could not send the invitation. Please try again.",
                ),
      };
    }
    grantId = data.id;
    to = email;

    const minted = await mintInviteLink(email, await getRequestOrigin());
    if ("error" in minted) {
      revalidatePath(eventPath(eventId));
      return {
        error:
          "The invitation is saved, but no sign-in link could be made. They can still sign in with this address to claim it.",
      };
    }
    inviteLink = minted.link;
    await supabase
      .from("pending_event_access_grants")
      .update({ invited_at: new Date().toISOString() })
      .eq("id", grantId);
  }

  const outcome = await sendEventAccessNotice(createSupabaseAdminClient(), {
    tenantId: event.tenant_id,
    grantId,
    to,
    eventName: event.name,
    level: input.level,
    areaLabels: areas
      .filter((area) => input.areas.includes(area.key))
      .map((area) => area.label),
    grantedBy,
    inviteLink,
    eventPath: eventPath(eventId),
    fallbackOrigin: await getRequestOrigin(),
  }).catch((error) => {
    console.error("[event-access] the notice threw", error);
    return "failed" as const;
  });

  revalidatePath(eventPath(eventId));
  return { success: true, emailed: outcome === "sent" };
}

export async function updateEventAccessAction(
  entry: Pick<EventAccessEntry, "kind" | "id">,
  rawInput: EventAccessInput,
): Promise<Result> {
  const input = cleanInput(rawInput);
  if (!input) return { error: "Pick a level and at least one area." };

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const denied = await checkPermission(
    supabase,
    "administration",
    "manage",
    ADMIN_ONLY,
  );
  if (denied) return denied;

  const table =
    entry.kind === "grant"
      ? "event_access_grants"
      : "pending_event_access_grants";
  const { data, error } = await supabase
    .from(table)
    .update({
      level: input.level,
      areas: input.areas,
      updated_by: userResult.user.id,
    })
    .eq("id", entry.id)
    .select("event_id");
  if (error) {
    return {
      error: eventAccessErrorMessage(
        error.message,
        "Could not change this access. Please try again.",
      ),
    };
  }
  if (!data || data.length === 0) {
    return { error: "This access was already removed." };
  }

  revalidatePath(eventPath(data[0].event_id));
  return { success: true };
}

/** Revoking deletes the row; the audit log keeps the history (#1685). */
export async function revokeEventAccessAction(
  entry: Pick<EventAccessEntry, "kind" | "id">,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(
    supabase,
    "administration",
    "manage",
    ADMIN_ONLY,
  );
  if (denied) return denied;

  const table =
    entry.kind === "grant"
      ? "event_access_grants"
      : "pending_event_access_grants";
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", entry.id)
    .select("event_id");
  if (error) {
    return { error: "Could not remove this access. Please try again." };
  }
  if (data && data.length > 0) revalidatePath(eventPath(data[0].event_id));
  return { success: true };
}
