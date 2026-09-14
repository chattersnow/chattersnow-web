export const DISTRIBUTION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "distributed", label: "Distributed" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "other", label: "Other" },
];

export const DISTRIBUTION_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(
    DISTRIBUTION_STATUSES.map((option) => [option.value, option.label]),
  );
