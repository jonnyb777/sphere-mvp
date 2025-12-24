// netlify/functions/market.js
// Free market data via Stooq (no API key)
// Computes trailing 30-day returns from daily closes

function parseStooqCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
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

  rows.sort((a, b) => b.date - a.date);
  return rows;
}

function compute30DayReturn(rows) {
  if (!rows.length) return null;

  const latest = rows[0];
  const cutoff = new Date(latest.date);
  cutoff.setDate(cutoff.getDate() - 30);

  const older = rows.find(r => r.date <= cutoff) || rows[rows.length - 1];
  if (!older || older.close <= 0) return null;

  return {
    return30d: (latest.close - older.close) / older.close,
    latestDate: latest.date.toISOString().slice(0, 10),
    olderDate: older.date.toISOString().slice(0, 10)
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
  const tickers = (event.queryStringParameters?.tickers || "")
    .split(",")
    .map(t => t.trim())
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
      const stats = compute30DayReturn(rows);
      if (!stats) continue;

      results.push({
        ticker: ticker.toUpperCase(),
        ...stats
      });
    } catch {}
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: results })
  };
}
