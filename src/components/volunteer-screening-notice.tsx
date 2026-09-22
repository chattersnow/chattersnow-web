import { cn } from "@/lib/utils";

/**
 * What the form collects, and what the organization does next (#690).
 *
 * Two claims of different kinds, which is why one is a constant here and the
 * other is a tenant's own words.
 *
 * `FORM_ASKS_FOR` is a fact about *this software*: the fields are the ones
 * `parseVolunteerApplicationForm` accepts, nothing in `src` or `supabase`
 * stores a date of birth or a government identification number, and a test
 * beside the parser keeps it that way. So it renders on every tenant, written
 * or not. It is doing protective work rather than decoration --
 * `availability` takes 2,000 characters, so somebody genuinely can paste an
 * SSN into a box nobody asked for, and the way to stop that is to say so where
 * they are typing.
 *
 * The paragraphs above it are `get_involved.volunteer_screening`, and they are
 * blank until an organization writes them. "We'll ask for references and may
 * run a background check" is a claim about a process the platform knows
 * nothing about; `docs/legal-basis.md` rule 2 keeps it out of a default.
 *
 * **Not a checkbox, and no link.** #1318 decided that submitting a public form
 * accepts nothing, so this is notice: there is nothing here to agree to. The
 * absent link matters as much -- the wording this replaces ended by saying
 * volunteering meant agreeing to the code of conduct, which asserts an
 * acceptance the form never obtains and points at a route that 404s until a
 * tenant adopts one (#859). The DOM test asserts zero anchors for that reason.
 *
 * The heading appears only with paragraphs under it. `EducationalDisclaimer`
 * makes the argument for a notice that renders nothing rather than an empty
 * shell; here it is stronger than a cosmetic one, because "What happens after
 * you apply" over nothing but the sentence below would be a promise nobody
 * made.
 */
export const FORM_ASKS_FOR =
  "This form asks for a name, an email address, and whatever else you choose to tell us. It does not ask for your date of birth, your home address, or a Social Security or other government ID number — please don't put those in it.";

export function VolunteerScreeningNotice({
  paragraphs,
  className,
}: {
  paragraphs: string[];
  className?: string;
}) {
  const written = paragraphs.filter((paragraph) => paragraph.trim());

  return (
    <div className={cn("space-y-2", className)}>
      {written.length > 0 && (
        <>
          {/* h3 rather than h2: the sheet's own title is the h2 (`SheetTitle`),
              and the page's h1 is above it. */}
          <h3 className="text-sm font-medium">What happens after you apply</h3>
          {written.map((paragraph, index) => (
            <p key={index} className="app-muted text-sm leading-relaxed">
              {paragraph}
            </p>
          ))}
        </>
      )}
      <p className="app-muted text-sm leading-relaxed">{FORM_ASKS_FOR}</p>
    </div>
  );
}
