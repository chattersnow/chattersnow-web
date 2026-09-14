import {
  Building2,
  CalendarDays,
  CalendarRange,
  Globe,
  HandCoins,
  HandHeart,
  Handshake,
  Landmark,
  Layers,
  LayoutDashboard,
  Mail,
  Package,
  Palette,
  Scale,
  Server,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";

/**
 * Icons live here rather than in the shared nav tree (`src/lib/portal/nav.ts`):
 * they're a rendering concern, and keeping them out lets the section index
 * routes import the tree on the server without an icon library coming with it.
 *
 * Shared by the desktop sidebar and the mobile shell's tab bar and sheet
 * (#1079) -- a second map would let a section's icon differ between the two
 * shells for no reason a reader could see.
 */
export const SECTION_ICONS: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  events: CalendarDays,
  artwork: Palette,
  calendar: CalendarRange,
  programs: Layers,
  inventory: Package,
  volunteers: HandHeart,
  messages: Mail,
  finance: Landmark,
  people: Users,
  donors: HandCoins,
  sponsors: Handshake,
  attendees: Ticket,
  governance: Scale,
  platform: Building2,
  website: Globe,
  technology: Server,
  administration: ShieldCheck,
};

/** The icon for a section, or the dashboard mark for one the map doesn't name. */
export function sectionIcon(value: string) {
  return SECTION_ICONS[value] ?? LayoutDashboard;
}
