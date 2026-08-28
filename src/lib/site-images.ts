import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveImageUrl } from "@/lib/inventory";

export type SiteImageSlot = {
  key: string;
  label: string;
  description: string;
};

/**
 * Registry of every admin-editable image slot on the public site. Adding a
 * new slot here (and reading it with `getSiteImageUrls`) is enough to wire
 * it up in the admin UI and on the page that uses it — no migration needed,
 * since every slot is just a keyed row in app_settings.
 */
export const SITE_IMAGE_SLOTS: SiteImageSlot[] = [
  {
    key: "gear_placeholder",
    label: "Gear placeholder",
    description: "Shown for any gear item that doesn't have its own photo.",
  },
  {
    key: "home_carousel_1",
    label: "Homepage carousel — slide 1",
    description: "First slide of the homepage image carousel.",
  },
  {
    key: "home_carousel_2",
    label: "Homepage carousel — slide 2",
    description: "Second slide of the homepage image carousel.",
  },
  {
    key: "home_carousel_3",
    label: "Homepage carousel — slide 3",
    description: "Third slide of the homepage image carousel.",
  },
  {
    key: "about_story_photo",
    label: "Our Story photo",
    description: "Photo alongside the Our Story section on the About page.",
  },
  {
    key: "about_mission_photo",
    label: "Our Mission photo",
    description: "Photo alongside the Our Values section on the Mission page.",
  },
  {
    key: "about_team_photo",
    label: "Team member photo",
    description: "Shown for any team member who doesn't have their own photo.",
  },
  {
    key: "get_involved_hero_1",
    label: "Get Involved — hero image 1",
    description: "Large hero image at the top of the Get Involved page.",
  },
  {
    key: "get_involved_hero_2",
    label: "Get Involved — hero image 2",
    description: "Small hero image at the top of the Get Involved page.",
  },
  {
    key: "get_involved_hero_3",
    label: "Get Involved — hero image 3",
    description: "Small hero image at the top of the Get Involved page.",
  },
  {
    key: "get_involved_volunteer_photo",
    label: "Volunteer page photo",
    description:
      "Shown for any volunteer role that doesn't have its own photo.",
  },
  {
    key: "get_involved_attend_photo",
    label: "Attend page photo",
    description: "Photo on the Attend page.",
  },
  {
    key: "get_involved_partner_photo",
    label: "Partner page photo",
    description: "Photo on the Become a Partner page.",
  },
  {
    key: "gears_donate_photo",
    label: "Donate gear page photo",
    description: "Photo on the Donate Gear page.",
  },
];

export function siteImageSettingKey(slot: string): string {
  return `site_images.${slot}`;
}

/** Reads every configured site image slot, resolved to a renderable URL. Unset slots are omitted. */
export async function getSiteImageUrls(
  supabase: SupabaseClient,
): Promise<Record<string, string | null>> {
  const { data } = await supabase
    .from("public_site_images")
    .select("slot, value");

  const urls: Record<string, string | null> = {};
  for (const row of data ?? []) {
    urls[row.slot] = resolveImageUrl(
      typeof row.value === "string" ? row.value : null,
    );
  }
  return urls;
}
