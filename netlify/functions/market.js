// netlify/functions/market.js
// Free market data via Stooq (no API key)
// Computes trailing-window returns from daily closes
// NOTE: Keeps response key name `return30d` for UI compatibility even when days=60/90.

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

// Pick the "latest" row to use based on asOf + mode
function pickAnchorRow(rowsDesc, asOfISO, mode) {
  if (!rowsDesc.length) return null;

  if (!asOfISO) return rowsDesc[0]; // dataset latest

  const asOfDay = new Date(asOfISO);
  if (Number.isNaN(asOfDay.getTime())) return rowsDesc[0];

  const anchorTime =
    mode === "monthEnd" ? endOfMonthISO(asOfISO) || asOfDay : asOfDay;

  return rowsDesc.find((r) => r.date <= anchorTime) || rowsDesc[rowsDesc.length - 1];
}

function computeWindowReturn(rowsDesc, days, asOfISO, mode) {
  const latest = pickAnchorRow(rowsDesc, asOfISO, mode);
  if (!latest) return null;

  const cutoff = new Date(latest.date);
  cutoff.setDate(cutoff.getDate() - Number(days || 30));

  const older =
    rowsDesc.find((r) => r.date <= cutoff) || rowsDesc[rowsDesc.length - 1];

  if (!older || older.close <= 0) return null;

  return {
    // Even when days=60/90, we still use return30d key for minimal UI change.
    return30d: (latest.close - older.close) / older.close,
    latestDate: toISO(latest.date),
    olderDate: toISO(older.date),
  };
}

async function fetchCsv(ticker) {
  const t = ticker.includes(".") ? ticker : `${ticker}.us`;
  const url = `https://stooq.com/q/d/l/?s=${t.toLowerCase()}&i=d`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.text();
}

export async function handler(event) {
  const q = event.queryStringParameters || {};
  const days = Math.max(1, Math.min(365, Number(q.days || 30)));
  const asOf = q.asOf ? String(q.asOf) : ""; // "YYYY-MM-DD" or ""
  const modeRaw = String(q.mode || "trailing");
  const mode = modeRaw === "monthEnd" ? "monthEnd" : "trailing";

  const tickers = String(q.tickers || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (!tickers.length) {
    return { statusCode: 400, body: "No tickers provided" };
  }

  const results = [];

  for (const ticker of tickers) {
    try {
      const csv = await fetchCsv(ticker);
      if (!csv) continue;

      const rows = parseStooqCsv(csv);
      const stats = computeWindowReturn(rows, days, asOf, mode);
      if (!stats) continue;

      results.push({
        ticker: ticker.toUpperCase(),
        ...stats,
      });
    } catch {
      // swallow per-ticker errors
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: results }),
  };
}
