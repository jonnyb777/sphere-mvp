// FILE: src/components/MonthlyDrip.jsx
import { useEffect, useMemo, useState } from "react";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

/**
 * MonthlyDrip
 * - Shows user’s top merchants and top sectors (spend)
 * - Top 10 Merchants appears ABOVE Top Sectors
 * - Headline line:
 *   “This month, the highest concentration of your spending was in X.”
 * - Option A: Top Sectors (Spend) computed from ALL transactions (not only top merchants)
 * - Includes two toggles:
 *   - Merchants: Show all / Show top 10
 *   - Sectors: Show all / Show top 5
 * - DOES NOT include Alignment Snapshot (Drip) anymore (Alignment is its own section in Home)
 */
export default function MonthlyDrip({ transactions, onTopSectorsChange }) {
  const txs = useMemo(() => (Array.isArray(transactions) ? transactions : []), [transactions]);

  const [showAllMerchants, setShowAllMerchants] = useState(false);
  const [showAllSectors, setShowAllSectors] = useState(false);

  // Minimal mapping for “top sectors (spend)” bucketing
  const MERCHANT_TO_SECTOR = useMemo(
    () => [
      {
        match: ["amazon", "target", "walmart", "costco", "home depot", "lowe", "tj max", "tjmax", "kroger"],
        sector: "Consumer & Retail"
      },
      { match: ["cvs", "walgreens", "rite aid", "kaiser", "blue cross", "unitedhealth"], sector: "Healthcare" },
      { match: ["mcdonald", "starbucks", "chipotle", "domino", "yum", "taco bell", "kfc", "pizza"], sector: "Restaurants" },
      { match: ["uber", "lyft", "delta", "southwest", "american airlines", "fedex", "ups"], sector: "Transportation" },
      { match: ["exxon", "chevron", "shell", "valero", "phillips 66", "schlumberger", "slb"], sector: "Energy" },
      { match: ["apple", "microsoft", "google", "meta", "facebook", "nvidia", "amd", "oracle"], sector: "Technology" },
      { match: ["netflix", "disney", "hulu", "spotify", "warner"], sector: "Media & Entertainment" },
      {
        match: ["chase", "jpmorgan", "bank of america", "wells fargo", "citi", "goldman", "visa", "mastercard", "amex"],
        sector: "Financials"
      }
    ],
    []
  );

  const inferSector = (merchant) => {
    const m = String(merchant || "").toLowerCase();
    for (const rule of MERCHANT_TO_SECTOR) {
      if (rule.match.some((k) => m.includes(k))) return rule.sector;
    }
    return "Other / Unmapped";
  };

  // All merchants by spend (across ALL transactions)
  const allMerchants = useMemo(() => {
    const map = new Map();
    for (const tx of txs) {
      const merchant = (tx.merchant || tx.Merchant || tx.name || tx.Name || "").toString().trim();
      const amount = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
      if (!merchant || !Number.isFinite(amount)) continue;
      map.set(merchant, (map.get(merchant) || 0) + amount);
    }
    return Array.from(map.entries())
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [txs]);

  const top10Merchants = useMemo(() => allMerchants.slice(0, 10), [allMerchants]);

  // Option A: All sectors by spend (computed from ALL transactions)
  const allSectors = useMemo(() => {
    const map = new Map();
    for (const tx of txs) {
      const merchant = (tx.merchant || tx.Merchant || tx.name || tx.Name || "").toString().trim();
      const amount = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
      if (!merchant || !Number.isFinite(amount)) continue;

      const sector = inferSector(merchant);
      map.set(sector, (map.get(sector) || 0) + amount);
    }

    return Array.from(map.entries())
      .map(([sector, amount]) => ({ sector, amount }))
      .sort((a, b) => b.amount - a.amount)
      .filter((x) => x.sector !== "Other / Unmapped");
  }, [txs]);

  const top5Sectors = useMemo(() => allSectors.slice(0, 5), [allSectors]);

  const highestSector = useMemo(() => {
    return top5Sectors?.[0]?.sector || "—";
  }, [top5Sectors]);

  // Keep the existing contract: notify parent of TOP 5 sectors only
  useEffect(() => {
    if (typeof onTopSectorsChange === "function") {
      onTopSectorsChange(top5Sectors.map((x) => x.sector));
    }
  }, [top5Sectors, onTopSectorsChange]);

  const merchantsToShow = showAllMerchants ? allMerchants : top10Merchants;
  const sectorsToShow = showAllSectors ? allSectors : top5Sectors;

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        Monthly Drip summarizes your spending patterns from the uploaded transactions.
      </p>

      <p style={{ fontSize: "0.95rem" }}>
        This month, the highest concentration of your spending was in <b>{highestSector}</b>.
      </p>

      {/* Merchants ABOVE sectors */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h4 style={{ marginTop: "1rem", marginBottom: "0.25rem" }}>Top 10 Merchants (Spend)</h4>

        {allMerchants.length > 10 ? (
          <button
            type="button"
            onClick={() => setShowAllMerchants((v) => !v)}
            style={{ padding: "0.25rem 0.5rem" }}
          >
            {showAllMerchants ? "Show top 10" : "Show all"}
          </button>
        ) : null}
      </div>

      {merchantsToShow.length ? (
        <ol style={{ marginTop: "0.5rem" }}>
          {merchantsToShow.map((x) => (
            <li key={x.merchant}>
              <b>{x.merchant}</b> — {money(x.amount)}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ fontSize: "0.9rem" }}>Upload transactions to populate merchants.</p>
      )}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h4 style={{ marginTop: "1rem", marginBottom: "0.25rem" }}>Top Sectors (Spend)</h4>

        {allSectors.length > 5 ? (
          <button
            type="button"
            onClick={() => setShowAllSectors((v) => !v)}
            style={{ padding: "0.25rem 0.5rem" }}
          >
            {showAllSectors ? "Show top 5" : "Show all"}
          </button>
        ) : null}
      </div>

      {sectorsToShow.length ? (
        <ol style={{ marginTop: "0.5rem" }}>
          {sectorsToShow.map((x) => (
            <li key={x.sector}>
              <b>{x.sector}</b> — {money(x.amount)}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ fontSize: "0.9rem" }}>Upload transactions to populate sectors.</p>
      )}
    </div>
  );
}
