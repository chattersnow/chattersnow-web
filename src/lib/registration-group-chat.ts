/**
 * The event's group chat (#1648): a per-event switch, and on every
 * registration a staff-only "added" flag. Shared by the planning form, the
 * registrants table and page, and the detail sheet.
 */

/** `events.group_chat_label`'s check. */
export const GROUP_CHAT_LABEL_MAX_LENGTH = 40;

export const DEFAULT_GROUP_CHAT_LABEL = "Group chat";

/** What the portal calls the event's chat: its label, or "Group chat". */
export function groupChatLabel(label: string | null | undefined): string {
  return label?.trim() || DEFAULT_GROUP_CHAT_LABEL;
}

/**
 * The event's switch as the registrants surfaces read it: null when it is
 * off, which hides the column, the filter and every toggle.
 */
export type EventGroupChat = { label: string } | null;

export function eventGroupChat(event: {
  group_chat_enabled: boolean | null;
  group_chat_label: string | null;
}): EventGroupChat {
  return event.group_chat_enabled
    ? { label: groupChatLabel(event.group_chat_label) }
    : null;
}

/** `set_registrations_group_chat()`'s refusals, as staff read them. */
export const GROUP_CHAT_ERROR_MESSAGES: Record<string, string> = {
  GROUP_CHAT_DISABLED:
    "This event no longer tracks a group chat. Turn it on under Planning first.",
  EVENT_NOT_FOUND: "That event no longer exists.",
  REGISTRANT_NOT_FOUND:
    "One of those registrations is no longer on this event. Refresh and try again.",
};
