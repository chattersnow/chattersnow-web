import { zipSync, type Zippable } from "fflate";

/**
 * Bulk download for an event's photos (#1607): fetch each through its signed
 * URL and hand the set over as one .zip, so passing an event's photos on is
 * one save rather than one per photo.
 *
 * Built in the browser so no server ever holds the files. Photos only: they
 * are stored re-encoded at 2048px, a few hundred KB each, so a whole event
 * fits in memory where a set of 4K clips would not. Stored, not deflated --
 * JPEG and WebP are compressed already.
 */

/**
 * Names for the files inside the archive: the original filenames, with a
 * " (2)" before the extension for a repeat, since a phone names every photo
 * IMG_0001 and two people's batches collide.
 */
export function uniqueFilenames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const name = raw.replace(/[\\/]/g, "_") || "photo";
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
      candidate = `${stem} (${n})${extension}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

/** "Winter Social 2026 photos.zip", without the characters a filesystem refuses. */
export function photosZipName(eventName: string): string {
  const safe =
    eventName
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Event";
  return `${safe} photos.zip`;
}

export type ZipSource = { url: string; filename: string };

/**
 * Fetches every photo, zips them and saves the archive. Fails as a whole if
 * any photo cannot be fetched: a set quietly missing a photo is worse than
 * being told to try again. Never throws.
 */
export async function downloadPhotosAsZip(
  sources: readonly ZipSource[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: true } | { error: string }> {
  const names = uniqueFilenames(sources.map((source) => source.filename));
  const files: Zippable = {};
  try {
    for (const [index, source] of sources.entries()) {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      files[names[index]] = [
        new Uint8Array(await response.arrayBuffer()),
        { level: 0 },
      ];
      onProgress?.(index + 1, sources.length);
    }
  } catch (error) {
    console.error("Could not fetch a photo for the download", error);
    return {
      error:
        "Some photos couldn't be fetched. Reload the page and try again — download links expire after an hour.",
    };
  }

  const archive = zipSync(files);
  const href = URL.createObjectURL(
    new Blob([archive as BlobPart], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = zipName;
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has handed the blob to the download manager.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return { ok: true };
}
