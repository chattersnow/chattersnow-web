import {
  planEventMediaFile,
  type EventMediaKind,
  type EventMediaSlot,
} from "./event-media-files";
import type {
  EventMediaUploadResult,
  VideoUploadHandle,
  VideoUploadHandlers,
} from "./event-media";

/**
 * The event page's upload queue (#1606): photos and videos picked together,
 * a few uploading at once, each with its own state.
 *
 * Plain TypeScript with its uploads injected rather than a React hook, so the
 * states -- queued, uploading, paused, failed, done -- are tested without a
 * browser, and the component only renders a snapshot.
 */

export type EventMediaItemStatus =
  "queued" | "uploading" | "paused" | "failed" | "done";

export type EventMediaItem = {
  id: string;
  name: string;
  size: number;
  kind: EventMediaKind | null;
  status: EventMediaItemStatus;
  /** 0-1, or null before the first measurement. */
  progress: number | null;
  error: string | null;
  /** False for a file that can never be stored (wrong type, too large). */
  retryable: boolean;
};

export type FileDescription = { name: string; type: string; size: number };

export type EventMediaQueueDeps = {
  /** How many files upload at once. */
  concurrency?: number;
  mintSlots: (
    files: FileDescription[],
  ) => Promise<{ slots: EventMediaSlot[] } | { error: string }>;
  uploadPhoto: (
    file: File,
    slot: EventMediaSlot,
    onProgress: (fraction: number) => void,
  ) => Promise<EventMediaUploadResult>;
  createVideoUpload: (
    file: File,
    slot: EventMediaSlot,
    handlers: VideoUploadHandlers,
  ) => VideoUploadHandle;
  record: (
    slot: EventMediaSlot,
    originalName: string,
  ) => Promise<{ ok: true } | { error: string }>;
};

type Entry = {
  item: EventMediaItem;
  file: File;
  slot: EventMediaSlot | null;
  video: VideoUploadHandle | null;
};

export type EventMediaQueue = ReturnType<typeof createEventMediaQueue>;

export function createEventMediaQueue(deps: EventMediaQueueDeps) {
  const concurrency = deps.concurrency ?? 2;
  const entries = new Map<string, Entry>();
  let snapshot: EventMediaItem[] = [];
  const listeners = new Set<() => void>();

  function emit() {
    snapshot = [...entries.values()].map((entry) => entry.item);
    for (const listener of listeners) listener();
  }

  function update(id: string, patch: Partial<EventMediaItem>) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.item = { ...entry.item, ...patch };
    emit();
  }

  function fail(id: string, error: string) {
    update(id, { status: "failed", error });
    pump();
  }

  async function finish(id: string) {
    const entry = entries.get(id);
    if (!entry?.slot) return;
    const recorded = await deps.record(entry.slot, entry.file.name);
    if ("error" in recorded) {
      fail(id, recorded.error);
      return;
    }
    update(id, { status: "done", progress: 1, error: null });
    pump();
  }

  function start(entry: Entry) {
    const { id } = entry.item;
    const slot = entry.slot;
    if (!slot) return;
    update(id, { status: "uploading", error: null });

    if (slot.kind === "photo") {
      void deps
        .uploadPhoto(entry.file, slot, (progress) => update(id, { progress }))
        .then((result) => {
          if ("error" in result) fail(id, result.error);
          else void finish(id);
        });
      return;
    }

    entry.video ??= deps.createVideoUpload(entry.file, slot, {
      onProgress: (progress) => {
        // A pause aborts the request, but a progress tick already in flight
        // must not flip it back to uploading.
        if (entries.get(id)?.item.status === "uploading") {
          update(id, { progress });
        }
      },
      onSuccess: () => void finish(id),
      onError: (message) => fail(id, message),
    });
    entry.video.start();
  }

  function pump() {
    let running = [...entries.values()].filter(
      (entry) => entry.item.status === "uploading",
    ).length;
    for (const entry of entries.values()) {
      if (running >= concurrency) break;
      if (entry.item.status === "queued" && entry.slot) {
        running += 1;
        start(entry);
      }
    }
  }

  async function mintFor(ids: string[]) {
    const pending = ids
      .map((id) => entries.get(id))
      .filter((entry): entry is Entry => !!entry);
    if (pending.length === 0) return;

    const result = await deps.mintSlots(
      pending.map(({ file }) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      })),
    );
    if ("error" in result) {
      for (const entry of pending) fail(entry.item.id, result.error);
      return;
    }
    pending.forEach((entry, index) => {
      entry.slot = result.slots[index] ?? null;
    });
    pump();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,

    /** Queues picked files. Ones that can never be stored fail at once. */
    add(files: File[]) {
      const toMint: string[] = [];
      for (const file of files) {
        const id = crypto.randomUUID();
        const plan = planEventMediaFile(file);
        const failed = "error" in plan;
        entries.set(id, {
          file,
          slot: null,
          video: null,
          item: {
            id,
            name: file.name,
            size: file.size,
            kind: failed ? null : plan.kind,
            status: failed ? "failed" : "queued",
            progress: null,
            error: failed ? plan.error : null,
            retryable: !failed,
          },
        });
        if (!failed) toMint.push(id);
      }
      emit();
      return mintFor(toMint);
    },

    /** Videos only: a photo is one short request with nothing to resume. */
    pause(id: string) {
      const entry = entries.get(id);
      if (!entry?.video || entry.item.status !== "uploading") return;
      entry.video.pause();
      update(id, { status: "paused" });
      pump();
    },

    resume(id: string) {
      const entry = entries.get(id);
      if (entry?.item.status !== "paused") return;
      update(id, { status: "queued" });
      pump();
    },

    /**
     * A video carries on from where it stopped; a photo or a file that never
     * got a slot starts over.
     */
    retry(id: string) {
      const entry = entries.get(id);
      if (entry?.item.status !== "failed" || !entry.item.retryable) return;
      update(id, { status: "queued", error: null });
      if (entry.slot) pump();
      else void mintFor([id]);
    },

    /** Drops a finished or failed row from the list. */
    dismiss(id: string) {
      const status = entries.get(id)?.item.status;
      if (status !== "done" && status !== "failed") return;
      entries.delete(id);
      emit();
    },
  };
}
