import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as MediaActions from "./media-actions";
import * as EventMedia from "@/lib/storage/event-media";
import type { EventMediaSlot } from "@/lib/storage/event-media-files";
import type { VideoUploadHandlers } from "@/lib/storage/event-media";

const mintMock = mock(
  async (_eventId: string, files: { name: string; type: string }[]) => ({
    slots: files.map((file): EventMediaSlot => ({
      path: `t/e/${file.name}`,
      token: "token",
      kind: file.type.startsWith("video/") ? "video" : "photo",
      contentType: file.type.startsWith("video/") ? "video/mp4" : "image/jpeg",
    })),
  }),
);
const recordMock = mock(async () => ({ ok: true as const }));

mock.module("./media-actions", () => ({
  ...MediaActions,
  createEventMediaUploadSlotsAction: mintMock,
  recordEventMediaAction: recordMock,
}));

let photoResult: { ok: true } | { error: string } = { ok: true };
let videoHandlers: VideoUploadHandlers | null = null;
const pauseMock = mock(() => {});

mock.module("@/lib/storage/event-media", () => ({
  ...EventMedia,
  uploadEventPhoto: async (
    _file: File,
    _slot: EventMediaSlot,
    onProgress: (fraction: number) => void,
  ) => {
    onProgress(0.4);
    return photoResult;
  },
  createVideoUpload: (
    _file: File,
    _slot: EventMediaSlot,
    handlers: VideoUploadHandlers,
  ) => {
    videoHandlers = handlers;
    return { start: () => handlers.onProgress(0.1), pause: pauseMock };
  },
}));

const { EventMediaUploader } = await import("./event-media-uploader");

function pick(files: File[]) {
  return userEvent.upload(
    screen.getByLabelText("Choose photos and videos to upload"),
    files,
  );
}

function row(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

beforeEach(() => {
  photoResult = { ok: true };
  videoHandlers = null;
  mintMock.mockClear();
  recordMock.mockClear();
  pauseMock.mockClear();
});

describe("EventMediaUploader", () => {
  test("a photo uploads and is recorded", async () => {
    const onUploaded = mock(() => {});
    render(<EventMediaUploader eventId="event-1" onUploaded={onUploaded} />);
    await pick([new File(["x"], "beach.jpg", { type: "image/jpeg" })]);

    await waitFor(() =>
      expect(row("beach.jpg").getAttribute("data-status")).toBe("done"),
    );
    expect(within(row("beach.jpg")).getByText("Uploaded")).toBeTruthy();
    expect(mintMock.mock.calls[0][0]).toBe("event-1");
    expect(recordMock).toHaveBeenCalledWith("t/e/beach.jpg", "beach.jpg");
    // Once the burst settles, not straight away (#1653).
    expect(onUploaded).not.toHaveBeenCalled();
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
  });

  test("a batch of photos reloads the list once, not once each", async () => {
    const onUploaded = mock(() => {});
    render(<EventMediaUploader eventId="event-1" onUploaded={onUploaded} />);
    await pick(
      ["a.jpg", "b.jpg", "c.jpg"].map(
        (name) => new File(["x"], name, { type: "image/jpeg" }),
      ),
    );
    await waitFor(() =>
      expect(row("c.jpg").getAttribute("data-status")).toBe("done"),
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  test("a failed photo shows why and offers a retry", async () => {
    photoResult = { error: "beach.jpg stopped uploading." };
    render(<EventMediaUploader eventId="event-1" />);
    await pick([new File(["x"], "beach.jpg", { type: "image/jpeg" })]);

    await waitFor(() =>
      expect(row("beach.jpg").getAttribute("data-status")).toBe("failed"),
    );
    expect(screen.getByText("beach.jpg stopped uploading.")).toBeTruthy();

    photoResult = { ok: true };
    await userEvent.click(
      screen.getByRole("button", { name: "Retry beach.jpg" }),
    );
    await waitFor(() =>
      expect(row("beach.jpg").getAttribute("data-status")).toBe("done"),
    );
  });

  test("a video shows progress, pauses, resumes and finishes", async () => {
    render(<EventMediaUploader eventId="event-1" />);
    await pick([new File(["x"], "run.mp4", { type: "video/mp4" })]);

    const bar = await screen.findByRole("progressbar", {
      name: "Uploading run.mp4",
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("10");

    await userEvent.click(
      screen.getByRole("button", { name: "Pause run.mp4" }),
    );
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(row("run.mp4").getAttribute("data-status")).toBe("paused");

    await userEvent.click(
      screen.getByRole("button", { name: "Resume run.mp4" }),
    );
    expect(row("run.mp4").getAttribute("data-status")).toBe("uploading");

    videoHandlers?.onSuccess();
    await waitFor(() =>
      expect(row("run.mp4").getAttribute("data-status")).toBe("done"),
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("a file that can't be stored is refused without a retry", async () => {
    render(<EventMediaUploader eventId="event-1" />);
    await userEvent.upload(
      screen.getByLabelText("Choose photos and videos to upload"),
      [new File(["x"], "notes.pdf", { type: "application/pdf" })],
      { applyAccept: false },
    );

    expect(
      screen.getByText("notes.pdf is not a photo or a video."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry notes.pdf" }),
    ).toBeNull();
    expect(mintMock).not.toHaveBeenCalled();
  });
});
