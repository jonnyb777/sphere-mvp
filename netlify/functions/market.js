// FILE: netlify/functions/market.js
// Free market data via Stooq (no API key)
// Computes trailing-window returns from daily closes
// Back-compat: keeps `return30d` for UI, but also returns `returnNd` + `returnDays` + `asOfUsed`.

function parseStooqCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 3) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;

    const date = new Date(cols[0]);
    const close = Number(cols[4]);

    if (!Number.isFinite(close) || Number.isNaN(date.getTime())) continue;
    rows.push({ date, close });
  }

  rows.sort((a, b) => b.date - a.date); // newest -> oldest
  return rows;
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function endOfMonthISO(dateISO) {
  const dt = new Date(dateISO);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999);
}

function pickAnchorRow(rowsDesc, asOfISO, mode) {
  if (!rowsDesc.length) return null;

  // no asOf provided -> use latest
  if (!asOfISO) return rowsDesc[0];

  const asOfDay = new Date(asOfISO);
  if (Number.isNaN(asOfDay.getTime())) return rowsDesc[0];

  const anchorTime = mode === "monthEnd" ? endOfMonthISO(asOfISO) || asOfDay : asOfDay;

  // pick the first row <= anchorTime; if none, fall back to oldest
  return rowsDesc.find((r) => r.date <= anchorTime) || rowsDesc[rowsDesc.length - 1];
}

function computeWindowReturn(rowsDesc, days, asOfISO, mode) {
  const latest = pickAnchorRow(rowsDesc, asOfISO, mode);
  if (!latest) return null;

  const cutoff = new Date(latest.date);
  cutoff.setDate(cutoff.getDate() - Number(days || 30));

  const older = rowsDesc.find((r) => r.date <= cutoff) || rowsDesc[rowsDesc.length - 1];
  if (!older || older.close <= 0) return null;

  const ret = (latest.close - older.close) / older.close;
  const latestDate = toISO(latest.date);

  // Back-compat + explicit keyed return
  const out = {
    return30d: ret, // legacy key used by your UI
    returnDays: Number(days || 30),
    asOfUsed: latestDate,
    latestDate,
    olderDate: toISO(older.date)
  };

  // Add a days-specific key: return60d / return90d etc.
  out[`return${Number(days || 30)}d`] = ret;

  return out;
}

// ---- fetch with timeout so one slow ticker can't hang the whole function ----
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchCsv(ticker, timeoutMs = 8000) {
  const t = ticker.includes(".") ? ticker : `${ticker}.us`;
  const url = `https://stooq.com/q/d/l/?s=${t.toLowerCase()}&i=d`;
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) return null;
  return await res.text();
}

// ---- tiny concurrency limiter (no deps) ----
function pLimit(concurrency) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= concurrency) return;
    const item = queue.shift();
    if (!item) return;

    active++;
    Promise.resolve()
      .then(item.fn)
      .then(item.resolve, item.reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

export async function handler(event) {
  const q = event.queryStringParameters || {};
  const days = Math.max(1, Math.min(365, Number(q.days || 30)));
  const asOf = q.asOf ? String(q.asOf).slice(0, 10) : "";
  const modeRaw = String(q.mode || "trailing");
  const mode = modeRaw === "monthEnd" ? "monthEnd" : "trailing";

  const tickers = String(q.tickers || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (!tickers.length) return { statusCode: 400, body: "No tickers provided" };

  // keep this modest for netlify dev + avoids hammering stooq
  const limit = pLimit(6);

  const jobs = tickers.map((tkrRaw) =>
    limit(async () => {
      const ticker = String(tkrRaw || "").toUpperCase().trim();
      if (!ticker) return null;

      try {
        const csv = await fetchCsv(ticker, 8000);
        if (!csv) return null;

        const rows = parseStooqCsv(csv);
        const stats = computeWindowReturn(rows, days, asOf, mode);
        if (!stats) return null;

        return { ticker, ...stats };
      } catch {
        return null; // swallow per-ticker failure
      }
    })
  );

  const settled = await Promise.allSettled(jobs);
  const items = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) items.push(s.value);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      meta: { days, mode, asOf: asOf || null } // harmless metadata for debugging/UI if you want it later
    })
  };
}
