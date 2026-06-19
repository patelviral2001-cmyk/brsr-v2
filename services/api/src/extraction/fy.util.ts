/** Compute Indian FY label for a date — e.g. "FY25-26" for Aug-2025. */
export function fyLabel(date: Date, fyStartMonth = 4): string {
  const m = date.getUTCMonth() + 1; // 1..12
  const y = date.getUTCFullYear();
  const startYear = m >= fyStartMonth ? y : y - 1;
  const endYear = startYear + 1;
  return `FY${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}
