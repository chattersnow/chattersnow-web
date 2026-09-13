import { notFound } from "next/navigation";
import { EventDetailContent } from "../../../event-detail-content";
import { EventDetailModal } from "../../../event-detail-modal";
import { loadEventDetail } from "../../../event-detail-data";

/**
 * `/events/e/[id]` intercepted from the listing: the same event, the same query
 * and the same content component as the page next door, rendered in a sheet
 * over the list the visitor clicked from (#847).
 *
 * Interception only happens on client-side navigation, and this slot lives on
 * the /events layout, so a card followed from the home page (#846) or a link
 * from anywhere else lands on the full page instead.
 */
export default async function InterceptedEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await loadEventDetail(id);

  if (!event) notFound();

  return (
    <EventDetailModal>
      <EventDetailContent event={event} variant="sheet" />
    </EventDetailModal>
  );
}
