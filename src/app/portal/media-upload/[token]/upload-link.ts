import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import {
  hashConfirmationToken,
  isConfirmationToken,
} from "@/lib/notifications/notification-email-token";

/** What a live upload link opens (#1620): the event's name and dates, and nothing else of it. */
export type UploadLinkPage = {
  eventName: string;
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  label: string;
  expiresAt: string;
  /** The tenant's rights paragraphs, or empty when it publishes none. */
  rightsParagraphs: string[];
};

export type UploadLinkLookup =
  { link: UploadLinkPage } | { error: "invalid" | "rate_limited" };

type RawUploadLink = {
  event_name: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  label: string;
  expires_at: string;
  rights_terms: string | null;
};

/**
 * Resolves the token in an upload link's URL for its page.
 *
 * Shape-checked before it is hashed, so a mistyped URL never becomes a
 * database lookup. Every refusal the RPC makes comes back as one `invalid`.
 */
export async function lookUpUploadLink(
  token: string,
): Promise<UploadLinkLookup> {
  if (!isConfirmationToken(token)) return { error: "invalid" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_event_media_upload_link", {
    p_token_hash: hashConfirmationToken(token),
    p_ip_address: await getClientIp(),
  });
  if (error) {
    return {
      error: error.message.includes("RATE_LIMITED")
        ? "rate_limited"
        : "invalid",
    };
  }
  const raw = data as RawUploadLink | null;
  if (!raw) return { error: "invalid" };

  return {
    link: {
      eventName: raw.event_name,
      startsAt: raw.starts_at,
      endsAt: raw.ends_at,
      timeZone: raw.timezone ?? "UTC",
      label: raw.label,
      expiresAt: raw.expires_at,
      rightsParagraphs: (raw.rights_terms ?? "")
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
    },
  };
}
