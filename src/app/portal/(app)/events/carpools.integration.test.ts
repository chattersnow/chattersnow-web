// Integration test (#1649): carpool cars, passengers and paid ticks, through
// the carpool actions and the functions behind them, against a real local
// stack. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
} from "../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { listEventRegistrantsAction } = await import("./registrants-actions");
const {
  deleteCarpoolCarAction,
  moveCarpoolPassengerAction,
  saveCarpoolCarAction,
  setCarpoolPassengerPaidAction,
} = await import("./carpools-actions");

async function seedRegistration(eventId: string, partySize = 1) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      name: "Carpool Registrant",
      email: uniqueEmail("carpool"),
      party_size: partySize,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function enableCarpools(eventId: string, enabled = true) {
  const { error } = await adminClient
    .from("events")
    .update({ carpools_enabled: enabled })
    .eq("id", eventId);
  if (error) throw error;
}

async function addCar(
  eventId: string,
  driver: string | null = null,
  seats = 3,
): Promise<string> {
  const result = await saveCarpoolCarAction({
    eventId,
    carId: null,
    label: "",
    driverRegistrationId: driver,
    seats,
    leavingFrom: "",
    notes: "",
  });
  if (!("success" in result)) throw new Error(result.error.message);
  return result.carId;
}

async function passengersOf(carId: string) {
  const { data, error } = await adminClient
    .from("event_carpool_passengers")
    .select("registration_id, paid_driver_at, paid_marked_by")
    .eq("car_id", carId);
  if (error) throw error;
  return data;
}

describe("carpools (integration)", () => {
  test("adds cars, assigns and moves passengers, ticks paid, and lists the plan", async () => {
    const event = await createPublishedEvent();
    try {
      await enableCarpools(event.id);
      const driver = await seedRegistration(event.id);
      const rider = await seedRegistration(event.id, 2);
      const other = await seedRegistration(event.id);
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      const car1 = await addCar(event.id, driver, 1);
      const car2 = await addCar(event.id);

      expect(
        await moveCarpoolPassengerAction({
          eventId: event.id,
          registrationId: rider,
          toCarId: car1,
        }),
      ).toEqual({ success: true });
      expect(
        await moveCarpoolPassengerAction({
          eventId: event.id,
          registrationId: other,
          toCarId: car1,
        }),
      ).toEqual({ success: true });

      expect(
        await setCarpoolPassengerPaidAction({
          eventId: event.id,
          carId: car1,
          registrationId: rider,
          paid: true,
        }),
      ).toEqual({ success: true });

      const listed = await listEventRegistrantsAction(event.id);
      if (!("data" in listed)) throw new Error("expected data");
      const cars = listed.data.carpools!.cars;
      expect(cars.map((car) => car.label)).toEqual(["Car 1", "Car 2"]);
      expect(cars[0].driver?.registrationId).toBe(driver);
      // Party of two plus one: over its one seat, and still saved.
      expect(cars[0].passengers.map((p) => p.partySize)).toEqual([2, 1]);
      const paid = cars[0].passengers.find((p) => p.registrationId === rider)!;
      expect(paid.paidAt).not.toBeNull();
      expect(paid.paidByName).toBeTruthy();

      // Moving to another car clears the tick: a new driver to pay.
      await moveCarpoolPassengerAction({
        eventId: event.id,
        registrationId: rider,
        toCarId: car2,
      });
      expect(await passengersOf(car2)).toEqual([
        { registration_id: rider, paid_driver_at: null, paid_marked_by: null },
      ]);

      // Deleting a car sends its passengers back to Unassigned.
      expect(
        await deleteCarpoolCarAction({ eventId: event.id, carId: car2 }),
      ).toEqual({ success: true });
      const { count } = await adminClient
        .from("event_carpool_passengers")
        .select("id", { count: "exact", head: true })
        .eq("registration_id", rider);
      expect(count).toBe(0);
    } finally {
      await event.cleanup();
    }
  });

  test("a registration is in one car only, and never both driver and passenger", async () => {
    const event = await createPublishedEvent();
    try {
      await enableCarpools(event.id);
      const driver = await seedRegistration(event.id);
      const rider = await seedRegistration(event.id);
      currentSupabase = await signInAs(SEEDED_USERS.admin);
      const car1 = await addCar(event.id, driver);
      const car2 = await addCar(event.id);

      // The driver can't ride, and can't drive a second car.
      const asPassenger = await adminClient.rpc(
        "set_event_carpool_passengers",
        {
          p_car_id: car2,
          p_registration_ids: [driver],
        },
      );
      expect(asPassenger.error?.message).toBe("CARPOOL_ALREADY_ASSIGNED");
      const secondCar = await saveCarpoolCarAction({
        eventId: event.id,
        carId: car2,
        label: "",
        driverRegistrationId: driver,
        seats: 3,
        leavingFrom: "",
        notes: "",
      });
      expect("error" in secondCar).toBe(true);

      // A passenger in one car can't be set into another.
      await adminClient.rpc("set_event_carpool_passengers", {
        p_car_id: car1,
        p_registration_ids: [rider],
      });
      const twice = await adminClient.rpc("set_event_carpool_passengers", {
        p_car_id: car2,
        p_registration_ids: [rider],
      });
      expect(twice.error?.message).toBe("CARPOOL_ALREADY_ASSIGNED");

      // Nor be made a driver while riding.
      const riderDrives = await adminClient.rpc("save_event_carpool_car", {
        p_event_id: event.id,
        p_car_id: car2,
        p_label: "",
        p_driver_registration_id: rider,
        p_seats: 3,
        p_leaving_from: "",
        p_notes: "",
      });
      expect(riderDrives.error?.message).toBe("CARPOOL_ALREADY_ASSIGNED");
    } finally {
      await event.cleanup();
    }
  });

  test("cancelling takes a registration out of its car, and a driverless car keeps its passengers", async () => {
    const event = await createPublishedEvent();
    try {
      await enableCarpools(event.id);
      const driver = await seedRegistration(event.id);
      const rider = await seedRegistration(event.id);
      const leaver = await seedRegistration(event.id);
      currentSupabase = await signInAs(SEEDED_USERS.admin);
      const car = await addCar(event.id, driver);
      await adminClient.rpc("set_event_carpool_passengers", {
        p_car_id: car,
        p_registration_ids: [rider, leaver],
      });

      for (const id of [driver, leaver]) {
        const { error } = await adminClient.rpc("cancel_event_registration", {
          p_registration_id: id,
          p_reason: "not_attending",
        });
        expect(error).toBeNull();
      }

      const { data } = await adminClient
        .from("event_carpool_cars")
        .select("driver_registration_id")
        .eq("id", car)
        .single();
      expect(data?.driver_registration_id).toBeNull();
      expect((await passengersOf(car)).map((p) => p.registration_id)).toEqual([
        rider,
      ]);

      // And a cancelled registration can't be put back in.
      const back = await moveCarpoolPassengerAction({
        eventId: event.id,
        registrationId: leaver,
        toCarId: car,
      });
      expect("error" in back && back.error.message).toBe(
        "That registration has been cancelled.",
      );
    } finally {
      await event.cleanup();
    }
  });

  test("refuses another event's registration, an event with carpools off, and a viewer", async () => {
    const event = await createPublishedEvent();
    const other = await createPublishedEvent();
    try {
      await enableCarpools(event.id);
      const theirs = await seedRegistration(other.id);
      currentSupabase = await signInAs(SEEDED_USERS.admin);
      const car = await addCar(event.id);

      const crossEvent = await adminClient.rpc("set_event_carpool_passengers", {
        p_car_id: car,
        p_registration_ids: [theirs],
      });
      expect(crossEvent.error?.message).toBe("REGISTRANT_NOT_FOUND");
      const crossDriver = await adminClient.rpc("save_event_carpool_car", {
        p_event_id: event.id,
        p_car_id: car,
        p_label: "",
        p_driver_registration_id: theirs,
        p_seats: 3,
        p_leaving_from: "",
        p_notes: "",
      });
      expect(crossDriver.error?.message).toBe("REGISTRANT_NOT_FOUND");

      // The other event, switch off.
      const off = await adminClient.rpc("save_event_carpool_car", {
        p_event_id: other.id,
        p_car_id: null as unknown as string,
        p_label: "",
        p_driver_registration_id: null as unknown as string,
        p_seats: 3,
        p_leaving_from: "",
        p_notes: "",
      });
      expect(off.error?.message).toBe("CARPOOLS_DISABLED");
      const listed = await listEventRegistrantsAction(other.id);
      if (!("data" in listed)) throw new Error("expected data");
      expect(listed.data.carpools).toBeNull();

      // Someone without events access reads nothing and writes nothing.
      const outsider = await signInAs(SEEDED_USERS.noAccess);
      const { data: seen } = await outsider
        .from("event_carpool_cars")
        .select("id")
        .eq("id", car);
      expect(seen ?? []).toEqual([]);
      const write = await outsider.rpc("delete_event_carpool_car", {
        p_car_id: car,
      });
      expect(write.error).not.toBeNull();
    } finally {
      await event.cleanup();
      await other.cleanup();
    }
  });

  test("the seats question must be a live number question of the event, and archiving clears it", async () => {
    const event = await createPublishedEvent();
    try {
      // Questions are written only through their save function; the service
      // role stands in for it here.
      const { data: questions, error } = await serviceRoleClient()
        .from("event_registration_questions")
        .insert([
          { event_id: event.id, kind: "number", prompt: "Seats available" },
          { event_id: event.id, kind: "short_text", prompt: "Town" },
        ])
        .select("id, kind");
      if (error) throw error;
      const number = questions.find((q) => q.kind === "number")!.id;
      const text = questions.find((q) => q.kind === "short_text")!.id;

      const wrongKind = await adminClient
        .from("events")
        .update({ carpool_seats_question_id: text })
        .eq("id", event.id);
      expect(wrongKind.error?.message).toBe("CARPOOL_SEATS_QUESTION_INVALID");

      const ok = await adminClient
        .from("events")
        .update({ carpool_seats_question_id: number })
        .eq("id", event.id);
      expect(ok.error).toBeNull();

      await serviceRoleClient()
        .from("event_registration_questions")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", number);
      const { data } = await adminClient
        .from("events")
        .select("carpool_seats_question_id")
        .eq("id", event.id)
        .single();
      expect(data?.carpool_seats_question_id).toBeNull();
    } finally {
      await event.cleanup();
    }
  });
});

// Another tenant's event, registration and car, written with the service
// role. Suspended, so the sole-active-tenant default the rest of the suite
// relies on keeps resolving while it exists.
describe("carpools across tenants (integration)", () => {
  const service = serviceRoleClient();
  const run = crypto.randomUUID().slice(0, 8);
  let otherTenantId: string;
  let otherEventId: string;
  let otherRegistrationId: string;
  let otherCarId: string;

  beforeAll(async () => {
    const { data: tenant, error } = await service
      .from("tenants")
      .insert({
        name: `Carpool Isolation ${run}`,
        slug: `carpool-isolation-${run}`,
        status: "suspended",
      })
      .select("id")
      .single();
    if (error) throw error;
    otherTenantId = tenant.id as string;

    const {
      data: { user },
    } = await adminClient.auth.getUser();
    const { data: event, error: eventError } = await service
      .from("events")
      .insert({
        tenant_id: otherTenantId,
        created_by: user!.id,
        name: `Other tenant event ${run}`,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        timezone: "America/Chicago",
        carpools_enabled: true,
      })
      .select("id")
      .single();
    if (eventError) throw eventError;
    otherEventId = event.id as string;

    const { data: registration, error: registrationError } = await service
      .from("event_registrations")
      .insert({
        tenant_id: otherTenantId,
        event_id: otherEventId,
        name: "Other tenant registrant",
        email: uniqueEmail("carpool-other"),
        party_size: 1,
      })
      .select("id")
      .single();
    if (registrationError) throw registrationError;
    otherRegistrationId = registration.id as string;

    const { data: car, error: carError } = await service
      .from("event_carpool_cars")
      .insert({
        tenant_id: otherTenantId,
        event_id: otherEventId,
        label: "Their car",
        seats: 3,
      })
      .select("id")
      .single();
    if (carError) throw carError;
    otherCarId = car.id as string;
  });

  afterAll(async () => {
    await service.from("event_carpool_cars").delete().eq("id", otherCarId);
    await service
      .from("event_registrations")
      .delete()
      .eq("id", otherRegistrationId);
    await service.from("events").delete().eq("id", otherEventId);
    await service
      .from("retention_policies")
      .delete()
      .eq("tenant_id", otherTenantId);
    const { error } = await service
      .from("tenants")
      .delete()
      .eq("id", otherTenantId);
    if (error) throw error;
  });

  test("cannot read or write another tenant's cars, or use its registrations", async () => {
    const { data: seen } = await adminClient
      .from("event_carpool_cars")
      .select("id")
      .eq("id", otherCarId);
    expect(seen ?? []).toEqual([]);

    const theirCar = await adminClient.rpc("set_event_carpool_passengers", {
      p_car_id: otherCarId,
      p_registration_ids: [otherRegistrationId],
    });
    expect(theirCar.error?.message).toBe("CAR_NOT_FOUND");
    const theirEvent = await adminClient.rpc("move_carpool_passenger", {
      p_event_id: otherEventId,
      p_registration_id: otherRegistrationId,
      p_to_car_id: otherCarId,
    });
    expect(theirEvent.error?.message).toBe("EVENT_NOT_FOUND");

    const event = await createPublishedEvent();
    try {
      await enableCarpools(event.id);
      currentSupabase = await signInAs(SEEDED_USERS.admin);
      const car = await addCar(event.id);
      const theirRegistration = await adminClient.rpc(
        "set_event_carpool_passengers",
        { p_car_id: car, p_registration_ids: [otherRegistrationId] },
      );
      expect(theirRegistration.error?.message).toBe("REGISTRANT_NOT_FOUND");
    } finally {
      await event.cleanup();
    }

    const { count } = await service
      .from("event_carpool_passengers")
      .select("id", { count: "exact", head: true })
      .eq("registration_id", otherRegistrationId);
    expect(count).toBe(0);
  });
});
