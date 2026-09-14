"use client";

import type { ReactNode } from "react";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RoleKey } from "../people-shared";

export type ActivitySection = {
  /** The role flag this panel belongs to, and what `?activity=` carries. */
  key: RoleKey;
  /** The tenant's word for the role (#911), resolved by the page. */
  label: string;
  /** The role's history card, rendered on the server. */
  panel: ReactNode;
};

/**
 * Every role's history on a person, behind one tab strip instead of one card
 * each.
 *
 * The aspect registry is built to be extended -- its own comment says adding a
 * role is "a card file, an ASPECT_ACTIONS entry, and one line here" -- so a
 * card per role meant the page grew every time the platform learned a new one.
 * Recipient (#1073) took it to seven history cards and thirteen cards overall,
 * which is where #1108 stopped it: sections here cost a tab, not a card.
 *
 * The panels arrive already rendered, as server components the page invoked.
 * That is what keeps each card's query on the server and in the same wave it
 * ran in before, and it is why this file knows nothing about donations or
 * shifts -- it places cards, it does not fetch them.
 *
 * One role gets no strip. A tab bar with a single tab is a control that cannot
 * do anything, and most people in a directory hold exactly one role.
 */
export function PersonActivity({ sections }: { sections: ActivitySection[] }) {
  const keys = sections.map((section) => section.key);

  // In the URL rather than in state, for the reasons use-url-tab-state.ts
  // gives: Back returns to the previous role instead of leaving the person,
  // and a link can point a colleague at the shifts rather than at the top of
  // the record. Named `activity` rather than `tab` so it can sit alongside a
  // future tab elsewhere on the page without either one reading the other's
  // value.
  const [active, setActive] = useUrlTabState<RoleKey>({
    param: "activity",
    fallback: keys[0]!,
    isValid: (value): value is RoleKey => keys.includes(value as RoleKey),
  });

  if (sections.length === 0) return null;
  if (sections.length === 1) return <>{sections[0]!.panel}</>;

  return (
    <Tabs value={active} onValueChange={(value) => setActive(value as RoleKey)}>
      <TabsList variant="line" className="flex-wrap" aria-label="Activity">
        {sections.map((section) => (
          <TabsTrigger key={section.key} value={section.key}>
            {section.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {sections.map((section) => (
        // Base UI unmounts an inactive panel's subtree, which is what we want
        // here: the panels are read-only history with no form state to lose,
        // and the server has already sent all of them, so coming back to one
        // costs nothing.
        <TabsContent key={section.key} value={section.key}>
          {section.panel}
        </TabsContent>
      ))}
    </Tabs>
  );
}
