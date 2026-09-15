import { publicRead } from "@/lib/api/handler";
import { getPublicLexicon } from "@/lib/lexicon";

/**
 * The tenant's own words for the things it lends and the people around it
 * (#896), folded over the platform's defaults. A consumer that labels anything
 * -- a heading over a gear list, a volunteer call to action -- should label it
 * in these words rather than in ours.
 */
const route = publicRead(async ({ supabase }) => ({
  lexicon: await getPublicLexicon(supabase),
}));

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
