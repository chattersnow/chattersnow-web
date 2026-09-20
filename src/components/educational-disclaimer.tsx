import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * The notice under every Learn page.
 *
 * Its words were hardcoded here until #1331, and they were one tenant's: a
 * certified technician, an instructor and equipment setup, rendered under the
 * Learn pages of every organization on the platform — including the platform's
 * own marketing site, whose Learn section is a security page and an FAQ. The
 * text is the `learn.disclaimer` slot now, and a tenant that clears it gets no
 * notice at all rather than an empty box: a heading with nothing under it reads
 * as a page that failed to load.
 */
export function EducationalDisclaimer({ text }: { text: string }) {
  if (!text.trim()) return null;

  return (
    <Alert>
      <InfoIcon />
      <AlertTitle>Educational content only</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
