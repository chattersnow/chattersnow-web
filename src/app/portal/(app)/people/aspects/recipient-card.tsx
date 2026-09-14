import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ViewerTime } from "@/components/viewer-time";
import {
  deliveryMethodLabel,
  gearRequestStatusLabel,
} from "@/lib/gear-requests";
import { getPortalVocabulary } from "@/lib/tenant-person-roles";
import { HistoryCard, HistoryGroups, HistorySection } from "./history-card";

type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  occurred_at: string;
  reason: string | null;
  inventory_item: {
    id: string;
    description: string;
    size: string | null;
  } | null;
};

type Request = {
  id: string;
  status: string;
  delivery_method: string;
  created_at: string;
};

/**
 * What a movement means on a person's record, rather than on an item's.
 *
 * Only the types `recipient_person_id` is ever set on are named. Anything else
 * falls through to the raw value rather than to a guess, the way
 * `gearRequestStatusLabel` does: a movement type nobody anticipated should
 * read as itself in the UI, not as something it is not.
 */
const MOVEMENT_LABELS: Record<string, string> = {
  distributed: "Handed over",
  reserved: "Held for a request",
};

function movementLabel(type: string): string {
  return MOVEMENT_LABELS[type] ?? type;
}

/**
 * The recipient aspect (#1073): what this person got from the organization,
 * and what they have asked for and not got yet.
 *
 * Both halves, because the flag counts both. A request that has not been
 * fulfilled is not a receipt, so the two are separate sections rather than one
 * merged list -- a staffer looking at an open request must not read it as gear
 * already handed over. They are also two different records: `gear_requests` is
 * the submission (#1032) and says how the requester wants the gear and where it
 * stands, while `inventory_movements` is the item-level truth and is the only
 * one of the two that exists for a staff-recorded distribution or a giveaway
 * prize. An open request and the holds behind it therefore appear in both
 * sections, saying different things: one request, and the items it is holding.
 *
 * Contents are RLS-gated (`inventory:view` on both tables) while the flag that
 * renders the card is not, so a reader without inventory access gets the card
 * with nothing in it. That is the same bargain every other aspect card strikes
 * -- `aspects/types.ts` documents it -- and it is why the directory's Roles
 * column declines this role: see `rolesFor` in people-shared.tsx.
 */
export async function RecipientCard({
  personId,
  actions,
}: {
  personId: string;
  actions?: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const [{ data: movementData }, { data: requestData }, vocabulary] =
    await Promise.all([
      supabase
        .from("inventory_movements")
        .select(
          "id, movement_type, quantity, occurred_at, reason, inventory_item:inventory_items(id, description, size)",
        )
        .eq("recipient_person_id", personId)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: true }),
      supabase
        .from("gear_requests")
        .select("id, status, delivery_method, created_at")
        .eq("person_id", personId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }),
      getPortalVocabulary(supabase),
    ]);

  const movements = (movementData ?? []) as unknown as Movement[];
  const requests = (requestData ?? []) as unknown as Request[];
  const role = vocabulary.recipient.toLocaleLowerCase();

  return (
    <HistoryCard
      title={`${vocabulary.recipient} activity`}
      isEmpty={movements.length === 0 && requests.length === 0}
      emptyTitle={`No ${role} activity recorded`}
      emptyDescription={`Requests and anything handed over appear here once this person asks for or receives ${vocabulary.item_plural.toLocaleLowerCase()}.`}
      actions={actions}
    >
      <HistoryGroups>
        <HistorySection
          title={`Requests (${requests.length})`}
          isEmpty={requests.length === 0}
        >
          {requests.map((request) => (
            <li key={request.id}>
              <ViewerTime
                iso={request.created_at}
                fallbackZone="UTC"
                options={{ dateStyle: "medium" }}
              />{" "}
              · {gearRequestStatusLabel(request.status)} ·{" "}
              {deliveryMethodLabel(request.delivery_method)}
            </li>
          ))}
        </HistorySection>

        <HistorySection
          title={`${vocabulary.item_plural} (${movements.length})`}
          isEmpty={movements.length === 0}
        >
          {movements.map((movement) => (
            <li key={movement.id}>
              {movement.inventory_item?.description ?? "—"}
              {movement.inventory_item?.size
                ? ` · ${movement.inventory_item.size}`
                : ""}
              {movement.quantity > 1 ? ` · ×${movement.quantity}` : ""}
              <span className="app-muted block">
                {movementLabel(movement.movement_type)} ·{" "}
                <ViewerTime
                  iso={movement.occurred_at}
                  fallbackZone="UTC"
                  options={{ dateStyle: "medium" }}
                />
              </span>
            </li>
          ))}
        </HistorySection>
      </HistoryGroups>
    </HistoryCard>
  );
}
