import { useEffect, useMemo } from "react";

/**
 * Minimal, MVP-safe mapping:
 * Merchant keywords -> sector bucket names that MarketPulse understands.
 * You can expand this over time.
 */
const MERCHANT_TO_SECTOR = [
  { match: ["amazon", "target", "walmart", "costco", "home depot", "lowe", "tj max", "tjmax", "kroger"], sector: "Consumer & Retail" },
  { match: ["cvs", "walgreens", "rite aid", "kaiser", "blue cross", "unitedhealth"], sector: "Healthcare" },
  { match: ["mcdonald", "starbucks", "chipotle", "domino", "yum", "taco bell", "kfc", "pizza"], sector: "Restaurants" },
  { match: ["uber", "lyft", "delta", "southwest", "american airlines", "fedex", "ups"], sector: "Transportation" },
  { match: ["exxon", "chevron", "shell", "valero", "phillips 66"], sector: "Energy" },
  { match: ["apple", "microsoft", "google", "meta", "facebook", "nvidia", "amd", "oracle"], sector: "Technology" },
  { match: ["netflix", "disney", "hulu", "spotify", "warner"], sector: "Media & Entertainment" },
  { match: ["chase", "jpmorgan", "bank of america", "wells fargo", "citi", "goldman", "visa", "mastercard", "amex"], sector: "Financials" }
];

// normalize incoming transactions (csv/xlsx/json) into {merchant, amount}
function normalizeTransactions(transactions) {
  const arr = Array.isArray(transactions) ? transactions : [];
  return arr
    .map((tx) => {
      const merchant = (tx.merchant || tx.Merchant || tx.name || tx.Name || tx.description || tx.Description || "")
        .toString()
        .trim();
      const amountRaw = tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? tx.amt ?? tx.Amt ?? 0;
      const amount = Number(amountRaw);
      return { merchant, amount };
    })
    .filter((x) => x.merchant && Number.isFinite(x.amount));
}

function inferSectorFromMerchant(merchant) {
  const m = String(merchant || "").toLowerCase();
  for (const rule of MERCHANT_TO_SECTOR) {
    if (rule.match.some((k) => m.includes(k))) return rule.sector;
  }
  return "Other / Unmapped";
}

export default function MonthlyDrip({ transactions, onTopSectorsChange }) {
  const normalized = useMemo(() => normalizeTransactions(transactions), [transactions]);

  // Raw merchant totals (as-is)
  const merchantTotals = useMemo(() => {
    const map = new Map();
    for (const tx of normalized) {
      map.set(tx.merchant, (map.get(tx.merchant) || 0) + tx.amount);
    }
    return Array.from(map.entries())
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [normalized]);

  // Sector totals (mapped)
  const sectorTotals = useMemo(() => {
    const map = new Map();
    for (const tx of normalized) {
      const sector = inferSectorFromMerchant(tx.merchant);
      map.set(sector, (map.get(sector) || 0) + tx.amount);
    }
    return Array.from(map.entries())
      .map(([sector, amount]) => ({ sector, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [normalized]);

  // TOP sectors we want to hand to MarketPulse (must be strings)
  const topSpendSectors = useMemo(() => {
    return sectorTotals
      .filter((x) => x.sector && x.sector !== "Other / Unmapped") // prefer mapped
      .slice(0, 5)
      .map((x) => x.sector);
  }, [sectorTotals]);

  // IMPORTANT: send sectors upward whenever they change
  useEffect(() => {
    if (typeof onTopSectorsChange === "function") {
      // If everything is unmapped, still send the top one so you can debug upstream
      const fallback =
        sectorTotals.length ? [sectorTotals[0].sector].filter(Boolean) : [];
      onTopSectorsChange(topSpendSectors.length ? topSpendSectors : fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topSpendSectors.join("|")]); // stable dependency

  const totalSpend = useMemo(() => {
    return normalized.reduce((sum, x) => sum + x.amount, 0);
  }, [normalized]);

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>Monthly Drip</h3>
      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        Total spend in uploaded data: <b>${totalSpend.toFixed(2)}</b>
      </p>

      <h4 style={{ marginBottom: "0.25rem" }}>Raw Merchant Breakdown (As-Is)</h4>
      {merchantTotals.length ? (
        <ol style={{ marginTop: "0.25rem" }}>
          {merchantTotals.slice(0, 15).map((x) => (
            <li key={x.merchant}>
              <b>{x.merchant}</b>: ${x.amount.toFixed(2)}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ fontSize: "0.9rem" }}>Upload transactions to see breakdown.</p>
      )}

      <h4 style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
        Sector Aggregation (Mapped)
      </h4>
      {sectorTotals.length ? (
        <ol style={{ marginTop: "0.25rem" }}>
          {sectorTotals.slice(0, 10).map((x) => (
            <li key={x.sector}>
              <b>{x.sector}</b>: ${x.amount.toFixed(2)}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
