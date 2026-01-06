// src/utils/changeDetect.js

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export function loadSnapshot(key) {
  return safeJsonParse(localStorage.getItem(key)) || null;
}

export function saveSnapshot(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Compare ranked arrays of items that have a stable `id` (ticker).
 * Returns:
 * - newEntrants: ids present now not before
 * - dropped: ids present before not now
 * - biggestRiser: item whose rank improved most (optional)
 */
export function diffRanked(prevIds = [], currIds = []) {
  const prevSet = new Set(prevIds);
  const currSet = new Set(currIds);

  const newEntrants = currIds.filter((id) => !prevSet.has(id));
  const dropped = prevIds.filter((id) => !currSet.has(id));

  const prevRank = new Map(prevIds.map((id, i) => [id, i]));
  let biggestRiser = null;
  let bestDelta = 0;

  for (let i = 0; i < currIds.length; i++) {
    const id = currIds[i];
    const p = prevRank.get(id);
    if (p === undefined) continue;
    const delta = p - i; // positive means improved rank
    if (delta > bestDelta) {
      bestDelta = delta;
      biggestRiser = { id, delta };
    }
  }

  return { newEntrants, dropped, biggestRiser };
}
