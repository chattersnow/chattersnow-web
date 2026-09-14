import { publicWrite, unwrap } from "@/lib/api/handler";
import { volunteerStatusLookupSchema } from "@/lib/api/schemas";

/**
 * Where an application got to.
 *
 * A POST rather than a GET even though it reads: the email and the reference
 * code together *are* the credential, and putting a credential in a query
 * string puts it in every access log and every `Referer` between here and the
 * consumer. It is rate-limited in Postgres like the writes, for the same
 * reason -- it is guessable if you are allowed enough guesses.
 *
 * A miss answers `{ status: null }` and a 200, not a 404: telling a caller
 * that *this* email has no application is telling them something about that
 * email.
 */
const route = publicWrite(
  volunteerStatusLookupSchema,
  async ({ supabase, body, clientIp }) => {
    const status = unwrap(
      await supabase.rpc("lookup_volunteer_application_status", {
        p_email: body.email,
        p_reference_code: body.reference_code,
        p_ip_address: clientIp,
      }),
    );

    return { status: status ?? null };
  },
);

export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
