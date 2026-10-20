/**
 * PUT a blob to a signed upload URL, reporting progress as it goes (#878).
 * Shared by artwork submissions and event photos (#1606).
 *
 * Hand-rolled rather than `supabase.storage.uploadToSignedUrl()`, and only for
 * that reason: supabase-js uploads through `fetch`, which cannot report upload
 * progress at all. Three artworks at 10 MB apiece over cellular is minutes of
 * an indeterminate spinner on the one step the whole page exists for, and
 * `XMLHttpRequest.upload.onprogress` is still the only way a browser will tell
 * you how far a request body has got.
 *
 * The request is a faithful copy of what storage-js builds for a Blob body, so
 * this stays compatible with the same endpoint: PUT to
 * `/object/upload/sign/{bucket}/{path}?token=`, multipart with `cacheControl`
 * and the file under an empty field name, and no explicit content-type header
 * -- the browser has to set that itself to carry the multipart boundary.
 */
export function putToSignedUrl(
  bucket: string,
  path: string,
  token: string,
  body: Blob,
  onProgress?: (fraction: number) => void,
): Promise<{ ok: true } | { status: number }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  // Path segments are server-minted uuids and a known extension, so they need
  // no escaping; the token is opaque and does.
  const url =
    `${base}/storage/v1/object/upload/sign/${bucket}/${path}` +
    `?token=${encodeURIComponent(token)}`;

  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", body);

  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("apikey", key);
    request.setRequestHeader("authorization", `Bearer ${key}`);
    request.setRequestHeader("x-upsert", "false");

    if (onProgress) {
      request.upload.addEventListener("progress", (event) => {
        // Not computable on the first tick, and on some proxies never; the
        // caller falls back to an indeterminate bar rather than showing 0%
        // forever.
        if (event.lengthComputable && event.total > 0) {
          onProgress(event.loaded / event.total);
        }
      });
    }

    // Resolved, never rejected: the caller is a form mid-entry and every
    // outcome here has to come back as something it can render.
    request.addEventListener("load", () => {
      resolve(
        request.status >= 200 && request.status < 300
          ? { ok: true }
          : { status: request.status },
      );
    });
    // status 0 is "the request never completed" -- offline, DNS, a cancelled
    // navigation. Indistinguishable from here and identical to the person uploading.
    request.addEventListener("error", () => resolve({ status: 0 }));
    request.addEventListener("abort", () => resolve({ status: 0 }));
    request.addEventListener("timeout", () => resolve({ status: 0 }));

    request.send(form);
  });
}
