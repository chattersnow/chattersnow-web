import { z } from "zod";

/**
 * The request bodies of the public API's writes (#813 Phase 3).
 *
 * These are the published contract: `/api/v1/openapi.json` is generated from
 * exactly these objects, so a schema and its documentation cannot drift.
 *
 * They are **not** the authority on what is acceptable. Every one of these
 * posts lands in a `security definer` RPC that checks the same things again
 * against the tenant's own settings -- whether shipping is on offer, whether
 * the event is still open, whether the module is even enabled -- because the
 * RPCs are reachable with `curl` whatever this layer says. What the schemas
 * buy is a 422 with a message beside the right field instead of a 500 from a
 * constraint, and a document a consumer can read before writing any code.
 *
 * Optional fields are `.optional()` rather than `.nullable()`: leaving a key
 * out is how JSON says "nothing", and a consumer should not have to send
 * `"phone": null`. Both are accepted where the column is nullable, and the
 * handler normalises either to null.
 */

/** Trimmed, and empty-after-trimming counts as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional()
    .nullable()
    .transform((value) => value ?? undefined);

const name = z
  .string()
  .trim()
  .min(1, "A name is required.")
  .max(200, "That name is too long.")
  .meta({ description: "The person's name, as they gave it." });

const email = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "A valid email address is required.")
  .meta({ description: "Where the organization can reply." });

const phone = optionalText(60).meta({ description: "Optional phone number." });

const pronouns = optionalText(40).meta({
  description: "Optional; 40 characters or fewer, as Postgres also enforces.",
});

export const contactMessageSchema = z
  .object({
    name,
    email,
    topic: optionalText(120).meta({
      description: "What the message is about. Defaults to `general`.",
    }),
    message: z
      .string()
      .trim()
      .min(1, "A message is required.")
      .max(5000, "That message is too long."),
  })
  .meta({ id: "ContactMessage" });

export const volunteerApplicationSchema = z
  .object({
    name,
    email,
    phone,
    pronouns,
    role_interest: optionalText(200).meta({
      description:
        "The name of a role from `/volunteer-roles`, or the applicant's own words.",
    }),
    availability: optionalText(2000).meta({
      description: "Free text: when they can help.",
    }),
  })
  .meta({ id: "VolunteerApplication" });

export const volunteerStatusLookupSchema = z
  .object({
    email,
    reference_code: z.string().trim().min(1).max(32).meta({
      description:
        "The code returned when the application was submitted. Case-insensitive.",
    }),
  })
  .meta({ id: "VolunteerStatusLookup" });

export const eventRegistrationSchema = z
  .object({
    name,
    email,
    phone,
    pronouns,
    party_size: z
      .int()
      .min(1, "Party size must be at least 1.")
      .max(100)
      .meta({ description: "How many people are coming, including this one." }),
    notes: optionalText(2000),
    instagram_handle: optionalText(30).meta({
      description: "Without the @; letters, numbers, dots and underscores.",
    }),
    // #685, and every one of them optional on purpose. This contract predates
    // the question, so a caller that says nothing is recorded as never having
    // been asked rather than as a "no" -- the same three-state reading the
    // column carries. Send `true` and the four contacts become required, which
    // is the one rule the organization's own policy rests on.
    party_includes_minor: z.boolean().optional().meta({
      description:
        "Whether anyone in the party is under 18. Omit it if you did not ask; it is never read as a no.",
    }),
    accompanying_adult_name: optionalText(200).meta({
      description:
        "The adult attending with them. Required when party_includes_minor is true.",
    }),
    accompanying_adult_phone: optionalText(50).meta({
      description:
        "A number that reaches that adult on the day. Required when party_includes_minor is true.",
    }),
    emergency_contact_name: optionalText(200).meta({
      description:
        "Who to call in an emergency. Required when party_includes_minor is true.",
    }),
    emergency_contact_phone: optionalText(50).meta({
      description:
        "That contact's number. Required when party_includes_minor is true.",
    }),
  })
  .meta({ id: "EventRegistration" });

const shippingAddressSchema = z
  .object({
    name: optionalText(200).meta({
      description: "Who to address the parcel to, if not the requester.",
    }),
    line1: z.string().trim().min(1).max(200),
    line2: optionalText(200),
    city: z.string().trim().min(1).max(120),
    region: optionalText(120),
    postal_code: z.string().trim().min(1).max(32),
    country: optionalText(120),
  })
  .meta({ id: "ShippingAddress" });

export const gearRequestSchema = z
  .object({
    item_ids: z
      .array(z.uuid())
      .min(1, "Name at least one item.")
      .max(25)
      .meta({ description: "Ids from `/gear`, all of them still available." }),
    name,
    email,
    phone,
    instagram_handle: optionalText(30).meta({
      description: "Without the @; letters, numbers, dots and underscores.",
    }),
    notes: optionalText(2000),
    delivery_method: z.enum(["meetup", "shipping"]).optional().meta({
      description:
        "Defaults to `meetup`. `shipping` is refused unless the organization offers it — see `/gear-request-settings`.",
    }),
    shipping: shippingAddressSchema.optional().meta({
      description: "Required when `delivery_method` is `shipping`.",
    }),
    payment_method: optionalText(60).meta({
      description:
        "One of the keys from `/gear-request-settings`, when shipping.",
    }),
  })
  .meta({ id: "GearRequest" });

export const riderProfileSchema = z
  .object({
    registration_id: z.uuid().meta({
      description:
        "The id returned by a registration, within a day of making it.",
    }),
    riding_discipline: z.enum(["ski", "snowboard", "both"]),
    ski_experience_level: z
      .enum(["beginner", "intermediate", "advanced"])
      .optional()
      .meta({ description: "Required when the discipline includes skiing." }),
    snowboard_experience_level: z
      .enum(["beginner", "intermediate", "advanced"])
      .optional()
      .meta({
        description: "Required when the discipline includes snowboarding.",
      }),
    preferred_mountain: optionalText(120),
  })
  .meta({ id: "RiderProfile" });

export type ContactMessageBody = z.infer<typeof contactMessageSchema>;
export type VolunteerApplicationBody = z.infer<
  typeof volunteerApplicationSchema
>;
export type VolunteerStatusLookupBody = z.infer<
  typeof volunteerStatusLookupSchema
>;
export type EventRegistrationBody = z.infer<typeof eventRegistrationSchema>;
export type GearRequestBody = z.infer<typeof gearRequestSchema>;
export type RiderProfileBody = z.infer<typeof riderProfileSchema>;
