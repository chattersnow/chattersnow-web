import { parsePage } from "@/lib/pagination";

export type RetentionParams = {
  page: number;
};

/**
 * Deliberately thinner than parseAuditLogParams: the run log is short (one row
 * a night) and reads newest-first, so filters would be furniture. Kept as its
 * own module anyway, so adding one later does not mean unpicking the page.
 */
export function parseRetentionParams(
  searchParams: Record<string, string | string[] | undefined>,
): RetentionParams {
  const raw = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return { page: parsePage(raw("page")) };
}
