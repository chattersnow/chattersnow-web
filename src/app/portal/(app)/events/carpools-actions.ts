"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";
import { CARPOOL_ERROR_MESSAGES, carpoolsHref } from "@/lib/event-carpools";

/**
 * The carpool board's writes (#1649). Each is gated on `events: manage` here
 * and again in the function it calls, which also refuses an event with the
 * switch off and a registration of another event or tenant, or a cancelled
 * one.
 */

type Result<T = Record<never, never>> = ({ success: true } & T) | ActionFailure;

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function callCarpool<T>(
  eventId: string,
  call: (
    supabase: Client,
  ) => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  fallback: string,
): Promise<{ success: true; data: T | null } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "events", "manage");
  if (denied) return fromGuard("forbidden", denied);

  const { data, error } = await call(supabase);
  if (error) {
    const message = CARPOOL_ERROR_MESSAGES[error.message];
    return message
      ? actionError("conflict", message)
      : actionError("server_error", fallback);
  }

  revalidatePath(carpoolsHref(eventId));
  return { success: true, data };
}

export async function saveCarpoolCarAction(input: {
  eventId: string;
  carId: string | null;
  label: string;
  driverRegistrationId: string | null;
  seats: number;
  leavingFrom: string;
  notes: string;
}): Promise<Result<{ carId: string }>> {
  const result = await callCarpool(
    input.eventId,
    (supabase) =>
      supabase.rpc("save_event_carpool_car", {
        p_event_id: input.eventId,
        p_car_id: input.carId as string,
        p_label: input.label,
        p_driver_registration_id: input.driverRegistrationId as string,
        p_seats: input.seats,
        p_leaving_from: input.leavingFrom,
        p_notes: input.notes,
      }),
    "Could not save the car. Please try again.",
  );
  return "error" in result
    ? result
    : { success: true, carId: result.data ?? "" };
}

export async function deleteCarpoolCarAction(input: {
  eventId: string;
  carId: string;
}): Promise<Result> {
  const result = await callCarpool(
    input.eventId,
    (supabase) =>
      supabase.rpc("delete_event_carpool_car", { p_car_id: input.carId }),
    "Could not delete the car. Please try again.",
  );
  return "error" in result ? result : { success: true };
}

/** Into a car, between cars, or with `toCarId` null back to Unassigned. */
export async function moveCarpoolPassengerAction(input: {
  eventId: string;
  registrationId: string;
  toCarId: string | null;
}): Promise<Result> {
  const result = await callCarpool(
    input.eventId,
    (supabase) =>
      supabase.rpc("move_carpool_passenger", {
        p_event_id: input.eventId,
        p_registration_id: input.registrationId,
        // The generated types cannot say a uuid argument takes null.
        p_to_car_id: input.toCarId as string,
      }),
    "Could not move that registrant. Please try again.",
  );
  return "error" in result ? result : { success: true };
}

export async function setCarpoolPassengerPaidAction(input: {
  eventId: string;
  carId: string;
  registrationId: string;
  paid: boolean;
}): Promise<Result> {
  const result = await callCarpool(
    input.eventId,
    (supabase) =>
      supabase.rpc("set_carpool_passenger_paid", {
        p_car_id: input.carId,
        p_registration_id: input.registrationId,
        p_paid: input.paid,
      }),
    "Could not update the payment. Please try again.",
  );
  return "error" in result ? result : { success: true };
}
