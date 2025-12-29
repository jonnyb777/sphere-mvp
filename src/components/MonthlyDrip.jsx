import { useMemo, useEffect } from "react";

/**
 * Merchant → Sector mapping
 */
const MERCHANT_TO_SECTOR = [
  { match: ["amazon", "target", "walmart", "costco", "home depot", "lowe", "tj max", "tjmax", "kroger"], sector: "Consumer & Retail" },
  { match: ["cvs", "walgreens", "rite aid", "kaiser", "blue cross", "unitedhealth"], sector: "Healthcare" },
  { match: ["mcdonald", "starbucks", "chipotle", "domino", "yum", "taco bell", "kfc", "pizza"], sector: "Restaurants" },
  { match: ["uber", "lyft", "delta", "southwest", "american airlines", "fedex", "ups"], sector: "Transportation" },
  { match: ["exxon", "chevron", "shell", "valero", "phillips 66"], sector: "Energy" },
  { match: ["apple", "microsoft", "google", "meta", "facebook", "nvidia", "amd", "oracle"], sector: "Technology" },
  { match: ["netflix", "disney", "hulu", "spotify", "warner"], sector: "Media & Entertainment" },
  { match: ["chase", "jpmorgan", "bank of america", "wells fargo", "citi", "goldman"], sector: "Financials" }
];

function inferSector(merchant) {
  const m = (merchant || "").toLowerCase();
  for (const rule of MERCHANT_TO_SECTOR) {
    if (rule.match.some((k) => m.includes(k))) return rule.sector;
  }
  return "Other / Unmapped";
}

export default function MonthlyDrip({ transactions = [], onTopSectorsChange }) {
  const normalized = useMemo(() => {
    return (transactions || [])
      .map((t) => ({
        merchant: String(t.merchant || t.Merchant || t.name || "").trim(),
        amount: Number(t.amount ?? t.Amount ?? 0)
      }))
      .filter((x) => x.merchant && Number.isFinite(x.amount));
  }, [transactions]);

  const merchantTotals = useMemo(() => {
    const map = {};
    for (const t of normalized) {
      map[t.merchant] = (map[t.merchant] || 0) + t.amount;
    }
    return Object.entries(map)
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [normalized]);

  const sectorTotals = useMemo(() => {
    const map = {};
    for (const row of merchantTotals) {
      const sector = inferSector(row.merchant);
      map[sector] = (map[sector] || 0) + row.amount;
    }
    return Object.entries(map)
      .map(([sector, amount]) => ({ sector, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [merchantTotals]);

  const topSectors = useMemo(
    () => sectorTotals.filter(x => x.sector !== "Other / Unmapped").slice(0, 5),
    [sectorTotals]
  );

  useEffect(() => {
    if (typeof onTopSectorsChange === "function") {
      onTopSectorsChange(topSectors.map(s => s.sector));
    }
  }, [topSectors, onTopSectorsChange]);

  /** Alignment logic **/
  const alignment = useMemo(() => {
    return merchantTotals.map((m) => {
      const sector = inferSector(m.merchant);
      let tier = "Tier 3 — Sector Alignment";

      if (topSectors.some(s => s.sector === sector)) {
        tier = "Tier 2 — Sector Strength";
      }

      if (
        topSectors.some(s => s.sector === sector) &&
        m.amount > (merchantTotals[0]?.amount * 0.5 || 0)
      ) {
        tier = "Tier 1 — Strong Alignment";
      }

      return { ...m, sector, tier };
    });
  }, [merchantTotals, topSectors]);

  const totalSpend = merchantTotals.reduce((a, b) => a + b.amount, 0);

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3>Monthly Drip</h3>

      <p>
        <b>Total Spend:</b> ${totalSpend.toFixed(2)}
      </p>

      <h4>Raw Merchant Breakdown</h4>
      <ol>
        {merchantTotals.map((m) => (
          <li key={m.merchant}>
            <b>{m.merchant}</b>: ${m.amount.toFixed(2)}
          </li>
        ))}
      </ol>

      <h4>Sector Aggregation</h4>
      <ol>
        {sectorTotals.map((s) => (
          <li key={s.sector}>
            <b>{s.sector}</b>: ${s.amount.toFixed(2)}
          </li>
        ))}
      </ol>

      <h4>Alignment Snapshot (Drip)</h4>
      <p style={{ fontSize: "0.9rem" }}>
        Alignment shows how your spending overlaps with dominant sector behavior.
      </p>

      <ol>
        {alignment.map((a) => (
          <li key={a.merchant}>
            <b>{a.merchant}</b> — {a.sector} · <i>{a.tier}</i>
          </li>
        ))}
      </ol>
    </div>
  );
}
