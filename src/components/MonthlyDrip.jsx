import MarketPulse from "./MarketPulse";

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}
function pct(part, total) {
  if (!total || total <= 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}
function normalizeMerchant(name) {
  return (name || "").toLowerCase().trim();
}

// ✅ Default mapping (so you get real sectors immediately)
// SectorMapper can still override by setting sectorMap[normalizedMerchant]
const defaultMerchantToSector = {
  amazon: "Consumer & Retail",
  target: "Consumer & Retail",
  walmart: "Consumer & Retail",
  costco: "Consumer & Retail",

  cvs: "Healthcare",
  walgreens: "Healthcare",

  chipotle: "Restaurants",
  mcdonalds: "Restaurants",
  starbucks: "Restaurants",

  uber: "Transportation",
  lyft: "Transportation",

  shell: "Energy",
  chevron: "Energy",
  exxon: "Energy",

  apple: "Technology",
  google: "Technology",
  microsoft: "Technology",

  netflix: "Media & Entertainment",
  spotify: "Media & Entertainment"
};

function getSector(merchantName, sectorMap) {
  const key = normalizeMerchant(merchantName);

  // 1) user override wins
  if (sectorMap && sectorMap[key]) return sectorMap[key];

  // 2) fallback to defaults
  if (defaultMerchantToSector[key]) return defaultMerchantToSector[key];

  // 3) final fallback
  return "Other / Unmapped";
}

export default function MonthlyDrip({ transactions, sectorMap }) {
  if (!transactions || transactions.length === 0) {
    return <p style={{ marginTop: "1rem" }}>No transactions uploaded yet.</p>;
  }

  // Aggregate raw merchant totals (as-is)
  const merchantTotals = {};
  let totalSpend = 0;

  for (const tx of transactions) {
    const merchant = (tx.merchant || "Unknown").toString();
    const amount = Number(tx.amount) || 0;
    totalSpend += amount;
    merchantTotals[merchant] = (merchantTotals[merchant] || 0) + amount;
  }

  const rankedMerchants = Object.entries(merchantTotals)
    .map(([merchant, total]) => ({ merchant, total }))
    .sort((a, b) => b.total - a.total);

  // Aggregate into sectors
  const sectorTotals = {};
  for (const m of rankedMerchants) {
    const sector = getSector(m.merchant, sectorMap);
    sectorTotals[sector] = (sectorTotals[sector] || 0) + m.total;
  }

  const rankedSectors = Object.entries(sectorTotals)
    .map(([sector, total]) => ({ sector, total }))
    .sort((a, b) => b.total - a.total);

  const topSpendSectors = rankedSectors.slice(0, 5).map((s) => s.sector);

  const topSector = rankedSectors[0]?.sector || "Other / Unmapped";
  const topSectorSpend = rankedSectors[0]?.total || 0;

  const narrative = `This month, your highest concentration of spending was in "${topSector}" (${money(
    topSectorSpend
  )}, ${pct(topSectorSpend, totalSpend)} of your uploaded spend).`;

  return (
    <div style={{ marginTop: "1rem" }}>
      {/* RAW FIRST */}
      <h3>Raw Merchant Breakdown (As-Is)</h3>
      <ol>
        {rankedMerchants.map((m) => (
          <li key={m.merchant}>
            {m.merchant}: {money(m.total)} ({pct(m.total, totalSpend)})
          </li>
        ))}
      </ol>

      <hr />

      <h2>Monthly Drip</h2>
      <p>
        Total spend in uploaded data: <b>{money(totalSpend)}</b>
      </p>

      <hr />

      <h3>Narrative (Sector Aggregation)</h3>
      <p>
        <b>{narrative}</b>
      </p>

      <h4>Top Sectors (Your Spend)</h4>
      <ul>
        {rankedSectors.slice(0, 5).map((s) => (
          <li key={s.sector}>
            {s.sector}: {money(s.total)} ({pct(s.total, totalSpend)})
          </li>
        ))}
      </ul>

      <MarketPulse topSpendSectors={topSpendSectors} />
    </div>
  );
}
