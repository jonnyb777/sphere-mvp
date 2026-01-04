import { useEffect, useMemo, useState } from "react";
import { UI, SummaryBand, SubHeaderRow, TextLink } from "./SectionUI";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

/**
 * MonthlyDrip (UX-consistent)
 * - Merchants ABOVE sectors
 * - Option A: sector totals computed from ALL transactions
 * - Triangle toggle only for expand/collapse
 * - “Show all / Show top N” remains a subtle TextLink
 * - Typography + spacing from SectionUI (no logic changes)
 */
export default function MonthlyDrip({ transactions, onTopSectorsChange }) {
  const txs = useMemo(() => (Array.isArray(transactions) ? transactions : []), [transactions]);

  // Expand/collapse (triangle)
  const [openMerchants, setOpenMerchants] = useState(false);
  const [openSectors, setOpenSectors] = useState(false);

  // Keep your “show all” capability (text link)
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
  const highestSector = useMemo(() => top5Sectors?.[0]?.sector || "—", [top5Sectors]);

  // Keep the existing contract: notify parent of TOP 5 sectors only
  useEffect(() => {
    if (typeof onTopSectorsChange === "function") {
      onTopSectorsChange(top5Sectors.map((x) => x.sector));
    }
  }, [top5Sectors, onTopSectorsChange]);

  const merchantsToShow = showAllMerchants ? allMerchants : top10Merchants;
  const sectorsToShow = showAllSectors ? allSectors : top5Sectors;

  // Totals (logic unchanged)
  const totalSpend = useMemo(() => {
    let sum = 0;
    for (const tx of txs) {
      const amount = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
      if (!Number.isFinite(amount)) continue;
      sum += amount;
    }
    return sum;
  }, [txs]);

  const topMerchantTotal = useMemo(() => {
    return top10Merchants.reduce((acc, x) => acc + (Number.isFinite(x.amount) ? x.amount : 0), 0);
  }, [top10Merchants]);

  const topSectorTotal = useMemo(() => {
    return top5Sectors.reduce((acc, x) => acc + (Number.isFinite(x.amount) ? x.amount : 0), 0);
  }, [top5Sectors]);

  return (
    <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.45 }}>
      <p style={{ marginTop: 0, fontSize: UI.FONT_BODY }}>
        Monthly Drip summarizes your spending patterns from the uploaded transactions.
      </p>

      <SummaryBand>
        <div style={{ fontSize: UI.FONT_BODY }}>
          <b>Spending insight:</b> Most of your spending clustered in <b>{highestSector}</b>.
        </div>
        <div style={{ marginTop: 6, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
          Total spend: <b>{money(totalSpend)}</b> · Top 10 merchants: <b>{money(topMerchantTotal)}</b> · Top 5 sectors:{" "}
          <b>{money(topSectorTotal)}</b>
        </div>
      </SummaryBand>

      <SubHeaderRow
        title="Top 10 Merchants (Spend)"
        open={openMerchants}
        onToggle={() => setOpenMerchants((v) => !v)}
        rightSlot={
          allMerchants.length > 10 ? (
            <TextLink onClick={() => setShowAllMerchants((v) => !v)}>
              {showAllMerchants ? "Show top 10" : "Show all"}
            </TextLink>
          ) : null
        }
      />

      {!allMerchants.length ? (
        <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>Upload transactions to populate merchants.</p>
      ) : openMerchants ? (
        <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
          {merchantsToShow.map((x) => (
            <li key={x.merchant} style={{ marginBottom: "0.25rem" }}>
              <b>{x.merchant}</b> — {money(x.amount)}
            </li>
          ))}
        </ol>
      ) : null}

      <SubHeaderRow
        title="Top Sectors (Spend)"
        open={openSectors}
        onToggle={() => setOpenSectors((v) => !v)}
        rightSlot={
          allSectors.length > 5 ? (
            <TextLink onClick={() => setShowAllSectors((v) => !v)}>
              {showAllSectors ? "Show top 5" : "Show all"}
            </TextLink>
          ) : null
        }
      />

      {!allSectors.length ? (
        <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>Upload transactions to populate sectors.</p>
      ) : openSectors ? (
        <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
          {sectorsToShow.map((x) => (
            <li key={x.sector} style={{ marginBottom: "0.25rem" }}>
              <b>{x.sector}</b> — {money(x.amount)}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
