import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { UsersTable } from "./users-table";
import { listUsersAction } from "./actions";

export default async function UsersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await listUsersAction();

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Users
      </h1>

      <div className="mt-6">
        {"error" in result ? (
          <Card>
            <CardContent className="app-muted text-sm">{result.error}</CardContent>
          </Card>
        ) : (
          <UsersTable users={result.data} currentUserId={user?.id ?? null} />
        )}
      </div>
    </>
  );
}
