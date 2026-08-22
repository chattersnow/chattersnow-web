export type ParseResult<T> = { data: T } | { error: string };

export type GiveawayFormData = {
  name: string | null;
  ticketsSold: number;
  ticketPrice: number | null;
  revenueAmount: number;
  drawingDate: string | null;
  notes: string | null;
};

export function parseGiveawayForm(formData: FormData): ParseResult<GiveawayFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const ticketsSoldRaw = String(formData.get("ticketsSold") ?? "0").trim();
  const ticketPriceRaw = String(formData.get("ticketPrice") ?? "").trim();
  const revenueRaw = String(formData.get("revenueAmount") ?? "0").trim();
  const drawingDateRaw = String(formData.get("drawingDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const ticketsSold = Number(ticketsSoldRaw);
  if (!Number.isInteger(ticketsSold) || ticketsSold < 0) {
    return { error: "Tickets sold must be a whole number of 0 or more." };
  }

  const revenueAmount = Number(revenueRaw);
  if (!Number.isFinite(revenueAmount) || revenueAmount < 0) {
    return { error: "Revenue must be a positive number." };
  }

  let ticketPrice: number | null = null;
  if (ticketPriceRaw) {
    ticketPrice = Number(ticketPriceRaw);
    if (!Number.isFinite(ticketPrice) || ticketPrice < 0) {
      return { error: "Ticket price must be a positive number." };
    }
  }

  return {
    data: {
      name: name || null,
      ticketsSold,
      ticketPrice,
      revenueAmount,
      drawingDate: drawingDateRaw ? new Date(drawingDateRaw).toISOString() : null,
      notes: notes || null,
    },
  };
}

export type GiveawayPrizeFormData = {
  prizeName: string;
  donorName: string | null;
  estimatedValue: number | null;
  notes: string | null;
};

export function parseGiveawayPrizeForm(formData: FormData): ParseResult<GiveawayPrizeFormData> {
  const prizeName = String(formData.get("prizeName") ?? "").trim();
  const donorName = String(formData.get("donorName") ?? "").trim();
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
      donorName: donorName || null,
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

export function parseGiveawayWinnerForm(formData: FormData): ParseResult<GiveawayWinnerFormData> {
  const winnerName = String(formData.get("winnerName") ?? "").trim();
  const winnerContact = String(formData.get("winnerContact") ?? "").trim();
  const distributionStatus = String(formData.get("distributionStatus") ?? "pending");
  const distributedAtRaw = String(formData.get("distributedAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!winnerName) return { error: "Winner name is required." };

  return {
    data: {
      winnerName,
      winnerContact: winnerContact || null,
      distributionStatus,
      distributedAt: distributedAtRaw ? new Date(distributedAtRaw).toISOString() : null,
      notes: notes || null,
    },
  };
}
