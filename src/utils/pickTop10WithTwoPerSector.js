// FILE: src/utils/pickTop10WithTwoPerSector.js

/**
 * Pick Top-N items with a "prefer up to 2 per top sector" rule,
 * BUT ALWAYS fill to maxTotal when possible.
 *
 * Behavior:
 *  - Phase 1: try at least 1 per top sector
 *  - Phase 2: try to reach up to 2 per top sector
 *  - Phase 3: fill remaining with best overall WITHOUT sector caps (to reach maxTotal)
 *  - De-dupe by ticker.
 *  - Return sorted alphabetically by Sector, then Ticker.
 */
export function pickTop10WithTwoPerSector({
  items,
  topSectors,
  getSector,
  getTicker,
  maxTotal = 10,
  maxPerTopSector = 2
}) {
  const arr = Array.isArray(items) ? items : [];
  const top = (Array.isArray(topSectors) ? topSectors : []).filter(Boolean).slice(0, 5);

  const seenTickers = new Set();
  const chosen = [];

  // counts only apply during Phase 1 & 2
  const counts = new Map(top.map((s) => [s, 0]));

  const normTicker = (x) => String(getTicker(x) || "").toUpperCase().trim();
  const normSector = (x) => String(getSector(x) || "").trim();

  const pushIfOk = (x) => {
    const tkr = normTicker(x);
    if (!tkr) return false;
    if (seenTickers.has(tkr)) return false;
    chosen.push(x);
    seenTickers.add(tkr);
    return true;
  };

  // -------- Phase 1: at least 1 per top sector (best effort) --------
  for (const s of top) {
    if (chosen.length >= maxTotal) break;
    const pick = arr.find((x) => normSector(x) === s && !seenTickers.has(normTicker(x)));
    if (pick) {
      pushIfOk(pick);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
  }

  // -------- Phase 2: up to 2 per top sector (best effort) --------
  for (const s of top) {
    if (chosen.length >= maxTotal) break;
    const c = counts.get(s) || 0;
    if (c >= maxPerTopSector) continue;

    const pick = arr.find((x) => {
      if (normSector(x) !== s) return false;
      const tkr = normTicker(x);
      if (!tkr || seenTickers.has(tkr)) return false;
      return true;
    });

    if (pick) {
      pushIfOk(pick);
      counts.set(s, c + 1);
    }
  }

  // -------- Phase 3: fill remaining to maxTotal (NO sector caps) --------
  for (const x of arr) {
    if (chosen.length >= maxTotal) break;
    pushIfOk(x);
  }

  // Final stable alpha sort by Sector, then Ticker
  return chosen.slice(0, maxTotal).sort((a, b) => {
    const sa = String(getSector(a) || "").toUpperCase();
    const sb = String(getSector(b) || "").toUpperCase();
    if (sa < sb) return -1;
    if (sa > sb) return 1;

    const ta = String(getTicker(a) || "").toUpperCase();
    const tb = String(getTicker(b) || "").toUpperCase();
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
}
