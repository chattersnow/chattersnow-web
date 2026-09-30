import { beforeEach, describe, expect, mock, test } from "bun:test";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const TENANT = "11111111-2222-4333-8444-555555555555";
const UPLOAD = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const MINTED = `${TENANT}/governance/${UPLOAD}/Bylaws-2024.pdf`;
const SAVED = `${TENANT}/governance/${UPLOAD}/Old-bylaws.pdf`;

const uploadMock = mock<
  (path: string, body: Blob, options: unknown) => Promise<{ error: unknown }>
>(async () => ({ error: null }));
const removeMock = mock<(paths: string[]) => Promise<{ error: unknown }>>(
  async () => ({ error: null }),
);

// The browser client is what's faked, not `@/lib/storage/documents`, so the
// real file checks, naming and upload error mapping run under these tests.
mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => ({ upload: uploadMock, remove: removeMock }) },
  }),
}));

const createPathMock = mock<
  (
    module: string,
    name: string,
    kind: string,
  ) => Promise<{ path: string } | { error: string }>
>(async () => ({ path: MINTED }));

mock.module("@/app/portal/(app)/document-actions", () => ({
  createDocumentPathAction: createPathMock,
}));

URL.createObjectURL = () => "blob:local-preview";
URL.revokeObjectURL = () => {};

const { DocumentField } = await import("./document-field");
type DocumentValue = { link: string; path: string };

function pdf(name = "Bylaws 2024.pdf") {
  return new File([new Uint8Array([37, 80, 68, 70])], name, {
    type: "application/pdf",
  });
}

function Harness({
  initial = { link: "", path: "" },
  signedUrl = null,
  onChange,
}: {
  initial?: DocumentValue;
  signedUrl?: string | null;
  onChange?: (value: DocumentValue) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DocumentField
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      signedUrl={signedUrl}
      idPrefix="bylaws"
      module="governance"
    />
  );
}

describe("DocumentField", () => {
  beforeEach(() => {
    uploadMock.mockClear();
    removeMock.mockClear();
    createPathMock.mockClear();
    createPathMock.mockImplementation(async () => ({ path: MINTED }));
    uploadMock.mockImplementation(async () => ({ error: null }));
  });

  test("a pasted link previews its host with an Open button", async () => {
    render(<Harness />);
    await userEvent.type(
      screen.getByLabelText("Link"),
      "https://drive.google.com/file/d/abc",
    );
    expect(screen.getByText("drive.google.com")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open link on drive.google.com" }),
    ).toHaveAttribute("href", "https://drive.google.com/file/d/abc");
  });

  // Waits for the result: the upload awaits the action and Storage before it
  // touches state (see photo-upload-field.dom.test.tsx, #1104).
  test("an uploaded PDF replaces the link and shows its name", async () => {
    const onChange = mock<(value: DocumentValue) => void>(() => {});
    render(<Harness onChange={onChange} />);

    await userEvent.upload(screen.getByLabelText("Or upload a file"), pdf());

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ link: "", path: MINTED }),
    );
    expect(createPathMock).toHaveBeenCalledWith(
      "governance",
      "Bylaws 2024.pdf",
      "pdf",
    );
    expect(uploadMock.mock.calls[0][0]).toBe(MINTED);
    expect(await screen.findByText("Bylaws-2024.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Bylaws-2024.pdf" }),
    ).toHaveAttribute("href", "blob:local-preview");
    expect(screen.queryByLabelText("Link")).not.toBeInTheDocument();
  });

  test("a refused path is shown inline and nothing is uploaded", async () => {
    createPathMock.mockImplementation(async () => ({
      error: "Uploads are turned off in the demo. Paste a link instead.",
    }));
    render(<Harness />);

    await userEvent.upload(screen.getByLabelText("Or upload a file"), pdf());

    expect(
      await screen.findByText(
        "Uploads are turned off in the demo. Paste a link instead.",
      ),
    ).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  test("a file that is neither a PDF nor an image is refused up front", async () => {
    render(<Harness />);
    const sheet = new File(["a,b"], "budget.csv", { type: "text/csv" });

    // userEvent.upload honours `accept`; the check under test is the one
    // behind it, for a picker that doesn't.
    await userEvent.upload(screen.getByLabelText("Or upload a file"), sheet, {
      applyAccept: false,
    });

    expect(
      await screen.findByText("budget.csv is not a PDF or an image."),
    ).toBeInTheDocument();
    expect(createPathMock).not.toHaveBeenCalled();
  });

  test("a saved file opens through its signed URL", () => {
    render(
      <Harness
        initial={{ link: "", path: SAVED }}
        signedUrl="https://storage.example/signed"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Open Old-bylaws.pdf" }),
    ).toHaveAttribute("href", "https://storage.example/signed");
  });

  // The saved object is still the record's document until Save; only a file
  // uploaded in this session is deleted when it's removed.
  test("removing a saved file clears it without deleting the object", async () => {
    const onChange = mock<(value: DocumentValue) => void>(() => {});
    render(
      <Harness
        initial={{ link: "", path: SAVED }}
        signedUrl="https://storage.example/signed"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onChange).toHaveBeenCalledWith({ link: "", path: "" });
    expect(removeMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Link")).toBeInTheDocument();
  });

  test("removing a file uploaded this session deletes it", async () => {
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText("Or upload a file"), pdf());
    await screen.findByText("Bylaws-2024.pdf");

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith([MINTED]));
  });
});
