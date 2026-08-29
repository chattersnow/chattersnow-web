import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { MessagesTable } from "./messages-table";
import {
  CONTACT_MESSAGE_STATUSES,
  type ContactMessage,
  type ContactMessageStatus,
} from "./message-types";

type CommunicationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isContactMessageStatus(
  value: string | undefined,
): value is ContactMessageStatus {
  return (
    !!value && (CONTACT_MESSAGE_STATUSES as readonly string[]).includes(value)
  );
}

export default async function CommunicationsPage({
  searchParams,
}: CommunicationsPageProps) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "communications", "manage");

  const params = await searchParams;
  const statusParam = params.status;
  const initialStatusFilter = isContactMessageStatus(
    Array.isArray(statusParam) ? statusParam[0] : statusParam,
  )
    ? (statusParam as ContactMessageStatus)
    : null;

  const { data: messages, error } = await supabase
    .from("contact_messages")
    .select("id, name, email, topic, message, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Messages
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Contact-form submissions from the public site.
      </p>

      <div className="mt-6">
        {error ? (
          <p className="app-muted px-4 py-6 text-sm">
            Could not load messages. Please try again.
          </p>
        ) : (
          <MessagesTable
            messages={(messages ?? []) as ContactMessage[]}
            canManage={canManage}
            initialStatusFilter={initialStatusFilter}
          />
        )}
      </div>
    </>
  );
}
