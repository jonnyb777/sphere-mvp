// FILE: src/utils/timeWindow.js

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function safeISO(input, fallback = "") {
  const s = String(input || "").slice(0, 10);
  const dt = new Date(s);
  if (!s || Number.isNaN(dt.getTime())) return fallback;
  return s;
}

export function windowLabel({ timeframeDays, asOfDate, timeMode }) {
  const days = Number(timeframeDays || 30);
  const mode = timeMode === "monthEnd" ? "Month-end" : "Trailing";
  const asOf = asOfDate ? String(asOfDate) : "latest available";
  return `${days}d · ${mode} · as-of ${asOf}`;
}

/**
 * One place to compute the “effective” as-of used for labels/UI:
 * - if user picked an asOfDate -> use it
 * - else if backend gave you something (computedLatest) -> use it
 * - else fall back to today
 */
export function resolveAsOf({ asOfDate, computedLatest }) {
  const picked = safeISO(asOfDate, "");
  if (picked) return picked;

  const computed = safeISO(computedLatest, "");
  if (computed) return computed;

  return todayISO();
}
