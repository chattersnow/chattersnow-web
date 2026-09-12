"use client";

import { createContext, useContext, type ReactNode } from "react";
import { applyLexicon, type Lexicon } from "@/lib/lexicon";
import { DEFAULT_VOCABULARY } from "@/lib/person-roles";

/**
 * The tenant's own words, for the portal shell: what it lends (#896) and what
 * it calls the people it works with (#911).
 *
 * A context rather than a prop for the same reason `BrandLogoProvider` is one,
 * and the provider sits beside it in the portal layout. The sidebar and the
 * command palette are handed their lexicon directly -- they are that layout's
 * own children and already take its props. The breadcrumbs are not: they are
 * rendered by a few dozen pages that have no other reason to know anything
 * about the lexicon, and threading a prop through all of them to reach a trail
 * of labels is the kind of prop that gets dropped from the fortieth caller.
 *
 * The default is the platform's own words, so a subtree with no provider reads
 * "Inventory" rather than `{collection}`. That is the direction a mistake here
 * should fail in: a generic label is a small loss, a brace on screen is a bug
 * an administrator has to report.
 */
const LexiconContext = createContext<Lexicon>(DEFAULT_VOCABULARY);

export function LexiconProvider({
  lexicon,
  children,
}: {
  lexicon: Lexicon;
  children: ReactNode;
}) {
  return (
    <LexiconContext.Provider value={lexicon}>
      {children}
    </LexiconContext.Provider>
  );
}

/** The current tenant's lexicon. */
export function useLexicon(): Lexicon {
  return useContext(LexiconContext);
}

/** Resolves one registry template against the current tenant's lexicon. */
export function useNamed(template: string): string {
  return applyLexicon(template, useContext(LexiconContext));
}
