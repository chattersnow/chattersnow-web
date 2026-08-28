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
    key: "about_mission_bottom_photo",
    label: "Mission page — bottom photo",
    description:
      "Photo shown at the bottom of the Mission page, below the Why LGBTQ+ Snow Sports section.",
  },
  {
    key: "about_team_photo",
    label: "Team member photo",
    description: "Shown for any team member who doesn't have their own photo.",
  },
  {
    key: "about_team_hero_photo",
    label: "Meet the Team — top photo",
    description:
      "Photo between the Meet the Team heading and the team member cards.",
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
    key: "get_involved_community_photo",
    label: "Attend page — community photo",
    description:
      "Photo alongside the Join the Community section on the Attend page.",
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
  {
    key: "gears_donate_bottom_photo",
    label: "Donate gear page — bottom photo",
    description:
      "Photo at the bottom of the Donate Gear page, below Gear drives.",
  },
  {
    key: "sponsorship_photo_1",
    label: "Sponsorship page — photo 1",
    description:
      "First of two small photos at the bottom of the Sponsorship page.",
  },
  {
    key: "sponsorship_photo_2",
    label: "Sponsorship page — photo 2",
    description:
      "Second of two small photos at the bottom of the Sponsorship page.",
  },
  {
    key: "donations_photo",
    label: "Donations page photo",
    description: "Photo at the bottom of the Donations page.",
  },
  {
    key: "contact_photo_1",
    label: "Contact page — photo 1",
    description: "First of three photos at the bottom of the Contact page.",
  },
  {
    key: "contact_photo_2",
    label: "Contact page — photo 2",
    description: "Second of three photos at the bottom of the Contact page.",
  },
  {
    key: "contact_photo_3",
    label: "Contact page — photo 3",
    description: "Third of three photos at the bottom of the Contact page.",
  },
  {
    key: "learn_photo",
    label: "Learn section photo",
    description:
      "Photo shown at the bottom of every Learn page (the Learn index and each category page).",
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
