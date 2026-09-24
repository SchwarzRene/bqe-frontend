const DASH = "—";

export function money(value, { signed = true } = {}) {
  if (value === null || value === undefined) return DASH;
  const abs = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!signed) return (value < 0 ? "-" : "") + abs;
  return (value > 0 ? "+" : value < 0 ? "−" : "") + abs;
}

export function price(value, digits = 2) {
  if (value === null || value === undefined) return DASH;
  // Show at least the symbol's precision, but never hide digits the user typed.
  const typed = (String(value).split(".")[1] || "").length;
  const decimals = Math.min(Math.max(digits, typed), 8);
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function number(value, decimals = 2) {
  if (value === null || value === undefined) return DASH;
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export const percent = (value) => (value === null || value === undefined ? DASH : `${(value * 100).toFixed(1)}%`);
export const ratio = (value) => (value === null || value === undefined ? DASH : value.toFixed(2));
export const rMultiple = (value) => (value === null || value === undefined ? DASH : `${value > 0 ? "+" : ""}${value.toFixed(2)}R`);

export function pnlClass(value) {
  if (!value) return "";
  return value > 0 ? "profit" : "loss";
}

export function dateTime(iso) {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function date(iso) {
  if (!iso) return DASH;
  // Parse as local midnight — a bare "YYYY-MM-DD" would otherwise be read as UTC.
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function duration(minutes) {
  if (minutes === null || minutes === undefined) return DASH;
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const days = Math.floor(minutes / 1440);
  return `${days}d ${Math.floor((minutes % 1440) / 60)}h`;
}

/** Current local time in the `YYYY-MM-DDTHH:MM` shape a datetime-local input expects. */
export function nowLocalInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export const todayLocal = () => nowLocalInput().slice(0, 10);
