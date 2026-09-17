"use client";

import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/portal/markdown-text";
import { CopyButton } from "@/components/copy-button";

/**
 * Print or copy one meeting document -- the agenda, or the minutes (#1201).
 *
 * It takes the two formatted strings rather than a record to format, so the
 * agenda and the minutes each keep their own formatter (`agenda-export.ts`,
 * `minutes-export.ts`) and this file keeps none. Was `AgendaExportDialog`,
 * which held a second, hand-written copy of the agenda's structure purely to
 * render the print view: the two drifted the moment either changed, and the
 * printed page could disagree with what the Copy button put on the clipboard.
 *
 * Now the print view *is* the Markdown, rendered. `allow="document"` because
 * this string is one the app generated, so its `#` and `##` are real headings
 * rather than something a notetaker typed into a textarea.
 *
 * Print output is scoped to this view through the shared `.print-area` rule in
 * globals.css (a visibility trick), so the app chrome and the dialog overlay
 * are left off the printed page.
 *
 * Print and copy only, no share link: per the accepted decision record for
 * #524, governance content is never public -- the recipient gets it through a
 * channel the board member already controls.
 */
export function MeetingExportDialog({
  title,
  markdown,
  plainText,
}: {
  /** The dialog's heading, e.g. "Export minutes". */
  title: string;
  markdown: string;
  plainText: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Download /> Export
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Print or copy this to share it outside the portal — through email,
            Drive, or wherever the board already relays meeting materials.
          </DialogDescription>
        </DialogHeader>

        <MarkdownText
          allow="document"
          className="print-area max-h-[50vh] overflow-y-auto rounded-md border border-[var(--line)] p-4 text-sm"
        >
          {markdown}
        </MarkdownText>

        <DialogFooter showCloseButton>
          <CopyButton label="Copy as Markdown" getText={() => markdown} />
          <CopyButton label="Copy as plain text" getText={() => plainText} />
          <Button type="button" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
