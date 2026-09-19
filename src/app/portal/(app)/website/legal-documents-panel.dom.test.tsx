import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../test/toast-testing";
import { LEGAL_DOCUMENTS, legalDocument } from "@/lib/legal-documents";

const saveMock = mock(async (_key: string, _inForce: boolean) => ({
  success: true as const,
}));

mock.module("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
// Replaced outright rather than spread over the real module: `settings-actions`
// is a "use server" file, and since #1295 it reaches the server Supabase client
// to read this tenant's modules. Importing it to spread it would drag
// `cookies()` into a DOM test.
mock.module("./settings-actions", () => ({
  updateLegalPublicationAction: saveMock,
  updatePageVisibilityAction: saveMock,
  updateLayoutSettingAction: saveMock,
}));

const { LegalDocumentsPanel } = await import("./legal-documents-panel");

const TERMS = legalDocument("terms")!;
const HELD = TERMS.gates[0].refuseWithdrawing;

function renderPanel(status: { inForce: boolean; heldInForceBy?: string }) {
  renderWithToaster(
    <LegalDocumentsPanel
      documents={LEGAL_DOCUMENTS}
      statuses={LEGAL_DOCUMENTS.map((document) => ({
        key: document.key,
        inForce: document.key === "terms" ? status.inForce : false,
        ownDocument: false,
        heldInForceBy:
          document.key === "terms" ? status.heldInForceBy : undefined,
      }))}
    />,
  );
}

const clickTerms = () =>
  userEvent.click(screen.getByRole("switch", { name: TERMS.label }));

// #1295. The organization cannot withdraw the document the accounts on its own
// public website are governed by. The control stays where it was and says why
// it will not move, rather than vanishing the way the privacy policy's does --
// this is a state the organization can get out of by asking.
//
// Asserted through the switch's behaviour rather than its `disabled` attribute:
// the Base UI switch is not a plain `<button disabled>`, and what matters here
// is that the write does not happen.
describe("a document a live module depends on", () => {
  beforeEach(() => {
    saveMock.mockClear();
  });

  test("says why it cannot be withdrawn, and will not withdraw", async () => {
    renderPanel({ inForce: true, heldInForceBy: HELD });

    expect(screen.getByText(HELD)).toBeTruthy();
    await clickTerms();
    expect(saveMock).not.toHaveBeenCalled();
  });

  // Nothing depends on a document nobody has adopted: the module that would is
  // refused on the other side until this switch goes on.
  test("a document not yet in force is never held", async () => {
    renderPanel({ inForce: false, heldInForceBy: HELD });

    expect(screen.queryByText(HELD)).toBeNull();
    await clickTerms();
    expect(saveMock).toHaveBeenCalledWith("terms", true);
  });

  test("an unheld document still switches off", async () => {
    renderPanel({ inForce: true });

    expect(screen.queryByText(HELD)).toBeNull();
    await clickTerms();
    expect(saveMock).toHaveBeenCalledWith("terms", false);
  });
});
