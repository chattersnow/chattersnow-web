import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ContactFor = { id: string; name: string | null };

/**
 * The organizations that name this person as their primary contact. Its own
 * component so the page body awaits nothing but the person row -- otherwise
 * the aspect cards aren't invoked until this query resolves, adding a wave to
 * the request.
 */
export async function ContactFor({ personId }: { personId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("people")
    .select("id, name")
    .eq("primary_contact_person_id", personId);
  const organizations = (data ?? []) as unknown as ContactFor[];

  if (organizations.length === 0) return null;

  return (
    <div className="app-muted mt-3 flex flex-col gap-1 text-sm">
      {organizations.map((organization) => (
        <p key={organization.id}>
          Contact for:{" "}
          <Link
            href={`/portal/people/${organization.id}`}
            className="underline underline-offset-2"
          >
            {organization.name ?? "—"}
          </Link>
        </p>
      ))}
    </div>
  );
}
