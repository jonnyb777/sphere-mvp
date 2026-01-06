// FILE: src/utils/runnersChange.js

export function computeRunnersChange(prev = [], curr = []) {
  const prevSet = new Set(prev);
  const currSet = new Set(curr);

  const newEntrants = curr.filter((t) => !prevSet.has(t));
  const dropped = prev.filter((t) => !currSet.has(t));

  // Biggest riser requires ranks. We'll compute rank delta by position.
  // rank 1 = best. Lower number is better.
  const prevRank = new Map(prev.map((t, i) => [t, i + 1]));
  const currRank = new Map(curr.map((t, i) => [t, i + 1]));

  const deltas = [];
  for (const t of curr) {
    if (!prevRank.has(t)) continue; // only tickers that existed before
    deltas.push({
      ticker: t,
      delta: prevRank.get(t) - currRank.get(t) // positive = moved up
    });
  }

  deltas.sort((a, b) => b.delta - a.delta);
  const biggestRiser = deltas.length ? deltas[0] : null;

  return { newEntrants, dropped, biggestRiser };
}
