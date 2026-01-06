// FILE: src/utils/timeWindow.js

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function endOfMonth(dateISO) {
  const dt = new Date(dateISO);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Returns { start: Date, end: Date } for a (timeframeDays, asOfISO, mode) window.
 * mode: "trailing" -> end = asOfISO
 * mode: "monthEnd" -> end = endOfMonth(asOfISO)
 */
export function computeWindow(timeframeDays = 30, asOfISO, mode = "trailing") {
  const iso = asOfISO || todayISO();
  const asOf = new Date(iso);
  if (Number.isNaN(asOf.getTime())) {
    // fallback: "now"
    const now = new Date();
    const end = now;
    const start = new Date(end);
    start.setDate(start.getDate() - Number(timeframeDays || 30));
    return { start, end };
  }

  const end = mode === "monthEnd" ? (endOfMonth(iso) || asOf) : asOf;

  const start = new Date(end);
  start.setDate(start.getDate() - Number(timeframeDays || 30));

  return { start, end };
}

export function withinWindow(itemDate, timeframeDays = 30, asOfISO, mode = "trailing") {
  if (!itemDate) return true; // if no date, don’t filter out
  const { start, end } = computeWindow(timeframeDays, asOfISO, mode);

  const dt = new Date(itemDate);
  if (Number.isNaN(dt.getTime())) return true;
  return dt >= start && dt <= end;
}
