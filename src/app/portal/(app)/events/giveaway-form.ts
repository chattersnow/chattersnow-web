import type { ParseResult } from "@/lib/forms";

export type GiveawayFormData = {
  name: string | null;
  drawingDate: string | null;
  notes: string | null;
};

export function parseGiveawayForm(
  formData: FormData,
): ParseResult<GiveawayFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const drawingDateRaw = String(formData.get("drawingDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  return {
    data: {
      name: name || null,
      // "YYYY-MM-DD" straight through to a `date` column (#1053).
      drawingDate: drawingDateRaw || null,
      notes: notes || null,
    },
  };
}

export type GiveawayPrizeFormData = {
  prizeName: string;
  estimatedValue: number | null;
  notes: string | null;
};

export function parseGiveawayPrizeForm(
  formData: FormData,
): ParseResult<GiveawayPrizeFormData> {
  const prizeName = String(formData.get("prizeName") ?? "").trim();
  const estimatedValueRaw = String(formData.get("estimatedValue") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!prizeName) return { error: "Prize name is required." };

  let estimatedValue: number | null = null;
  if (estimatedValueRaw) {
    estimatedValue = Number(estimatedValueRaw);
    if (!Number.isFinite(estimatedValue) || estimatedValue < 0) {
      return { error: "Estimated value must be a positive number." };
    }
  }

  return {
    data: {
      prizeName,
      estimatedValue,
      notes: notes || null,
    },
  };
}

export type GiveawayWinnerFormData = {
  winnerName: string;
  winnerContact: string | null;
  distributionStatus: string;
  distributedAt: string | null;
  notes: string | null;
};

export function parseGiveawayWinnerForm(
  formData: FormData,
): ParseResult<GiveawayWinnerFormData> {
  const winnerName = String(formData.get("winnerName") ?? "").trim();
  const winnerContact = String(formData.get("winnerContact") ?? "").trim();
  const distributionStatus = String(
    formData.get("distributionStatus") ?? "pending",
  );
  const distributedAtRaw = String(formData.get("distributedAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!winnerName) return { error: "Winner name is required." };

  return {
    data: {
      winnerName,
      winnerContact: winnerContact || null,
      distributionStatus,
      // "YYYY-MM-DD" straight through to a `date` column (#1053).
      distributedAt: distributedAtRaw || null,
      notes: notes || null,
    },
  };
}
