import { Badge } from "@/components/ui/badge";
import { ITEM_TYPE_LABELS } from "./calendar-shared";

export function ItemTypeBadge({ itemType }: { itemType: string }) {
  const label = ITEM_TYPE_LABELS[itemType] ?? itemType;

  if (itemType === "chatter_event") {
    return <Badge variant="default">{label}</Badge>;
  }
  if (itemType === "partner_event") {
    return <Badge variant="secondary">{label}</Badge>;
  }
  return <Badge variant="outline">{label}</Badge>;
}
