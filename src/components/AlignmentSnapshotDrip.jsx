// FILE: src/components/AlignmentSnapshotDrip.jsx
import { useMemo, useState } from "react";
import { inferTickerFromMerchant } from "../utils/mappings";

/**
 * Minimal, stable merchant->sector mapping (same buckets your app uses).
 * Kept local here so Alignment is a single source of truth and won’t drift.
 */
const MERCHANT_TO_SECTOR = [
  { match: ["amazon", "target", "walmart", "costco", "home depot", "lowe", "tj max", "tjmax", "kroger"], sector: "Consumer & Retail" },
  { match: ["cvs", "walgreens", "rite aid", "kaiser", "blue cross", "unitedhealth"], sector: "Healthcare" },
  { match: ["mcdonald", "starbucks", "chipotle", "domino", "yum", "taco bell", "kfc", "pizza"], sector: "Restaurants" },
  { match: ["uber", "lyft", "delta", "southwest", "american airlines", "fedex", "ups"], sector: "Transportation" },
  { match: ["exxon", "chevron", "shell", "valero", "phillips 66", "schlumberger", "slb"], sector: "Energy" },
  { match: ["apple", "microsoft", "google", "meta", "facebook", "nvidia", "amd", "oracle"], sector: "Technology" },
  { match: ["netflix", "disney", "hulu", "spotify", "warner"], sector: "Media & Entertainment" },
  { match: ["chase", "jpmorgan", "bank of america", "wells fargo", "citi", "goldman", "visa", "mastercard", "amex"], sector: "Financials" }
];

function inferSectorFromMerchant(merchant) {
  const m = String(merchant || "").toLowerCase();
  for (const rule of MERCHANT_TO_SECTOR) {
    if (rule.match.some((k) => m.includes(k))) return rule.sector;
  }
  return "Other / Unmapped";
}

/**
 * Map app buckets -> ETF sector leader names (as used by MarketPulse ETF list).
 * NOTE: This is intentionally “best-effort” for MVP.
 */
function bucketToEtfSectorName(bucket) {
  const b = String(bucket || "");
  if (b === "Technology") return "Technology";
  if (b === "Financials") return "Financials";
  if (b === "Healthcare") return "Healthcare";
  if (b === "Energy") return "Energy";
  if (b === "Industrials") return "Industrials";
  if (b === "Materials") return "Materials";
  if (b === "Utilities") return "Utilities";
  if (b === "Real Estate") return "Real Estate";
  if (b === "Media & Entertainment") return "Communication Services";
  if (b === "Consumer & Retail") return "Consumer Discretionary";
  if (b === "Restaurants") return "Consumer Discretionary";
  if (b === "Transportation") return "Industrials";
  return "";
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

export default function AlignmentSnapshotDrip({ transactions, sectorLeaders, personalRunners }) {
  const [showTierRules, setShowTierRules] = useState(false);

  const topMerchants = useMemo(() => {
    const arr = Array.isArray(transactions) ? transactions : [];
    const map = new Map();
    for (const tx of arr) {
      const m = (tx.merchant || tx.Merchant || tx.name || tx.Name || "").toString().trim();
      const a = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
      if (!m || !Number.isFinite(a)) continue;
      map.set(m, (map.get(m) || 0) + a);
    }
    return Array.from(map.entries())
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [transactions]);

  const sectorLeaderNames = useMemo(() => {
    const arr = Array.isArray(sectorLeaders) ? sectorLeaders : [];
    return new Set(arr.map((x) => String(x?.sectorName || "").trim()).filter(Boolean));
  }, [sectorLeaders]);

  const runnerSet = useMemo(() => {
    const arr = Array.isArray(personalRunners) ? personalRunners : [];
    return new Set(arr.map((t) => String(t || "").toUpperCase().trim()).filter(Boolean));
  }, [personalRunners]);

  const rows = useMemo(() => {
    return topMerchants.map((m) => {
      const sectorBucket = inferSectorFromMerchant(m.merchant);
      const etfSector = bucketToEtfSectorName(sectorBucket);
      const isSectorLeader = !!etfSector && sectorLeaderNames.has(etfSector);

      const inferredTicker = inferTickerFromMerchant(m.merchant);
      const tkr = inferredTicker ? String(inferredTicker).toUpperCase().trim() : "";
      const isRunner = tkr ? runnerSet.has(tkr) : false;

      let tier = "—";
      let label = "No flag";
      let reason =
        "No Tier flag triggered (not in Top 5 sector leaders and not in Top 10 runners).";

      if (isSectorLeader && isRunner) {
        tier = "Tier 1";
        label = "Strong Alignment";
        reason = "Merchant maps to a Top 10 Runner AND the related sector is a Top 5 Sector Leader.";
      } else if (!isSectorLeader && isRunner) {
        tier = "Tier 2";
        label = "Runner Signal";
        reason = "Merchant maps to a Top 10 Runner (even if the related sector is not a Top 5 leader).";
      } else if (isSectorLeader && !isRunner) {
        tier = "Tier 3";
        label = "Sector Strength";
        reason = "Merchant maps to a Top 5 Sector Leader (even if the specific merchant ticker is not a Top 10 runner).";
      }

      return {
        merchant: m.merchant,
        amount: m.amount,
        sectorBucket,
        etfSector: etfSector || "—",
        mappedTicker: tkr || "—",
        tier,
        label,
        reason
      };
    });
  }, [topMerchants, sectorLeaderNames, runnerSet]);

  if (!topMerchants.length) {
    return (
      <div>
        <p style={{ marginTop: 0 }}>
          Upload transactions to populate alignment.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        Alignment shows how your spending overlaps with dominant sector behavior.
      </p>

      <div style={{ marginTop: "0.5rem", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.92rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Merchant</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Spend</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Mapped Sector</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Sector Leader Proxy</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Mapped Ticker</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Tier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.merchant}>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  <b>{r.merchant}</b>
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{money(r.amount)}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{r.sectorBucket}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{r.etfSector}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{r.mappedTicker}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  <b>{r.tier}</b>
                  <div style={{ fontStyle: "italic", marginTop: 2 }}>{r.label}</div>
                  <div style={{ fontSize: "0.85rem", marginTop: 4 }}>{r.reason}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Toggle ONLY controls Tier rules */}
        <div style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
          <button
            onClick={() => setShowTierRules((v) => !v)}
            style={{
              padding: "0.45rem 0.7rem",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer"
            }}
          >
            {showTierRules ? "Hide tier rules" : "Show tier rules"}
          </button>

          {showTierRules ? (
            <div style={{ marginTop: "0.6rem" }}>
              <b>Tier rules:</b>
              <ul style={{ marginTop: "0.35rem" }}>
                <li><b>Tier 1</b>: sector leader + runner ticker</li>
                <li><b>Tier 2</b>: runner ticker only</li>
                <li><b>Tier 3</b>: sector leader only</li>
              </ul>
              <div style={{ marginTop: "0.35rem" }}>
                Tier flags are informational only — not recommendations.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
