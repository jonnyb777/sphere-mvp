// FILE: src/components/AlignmentSnapshotDrip.jsx
import { useMemo, useState } from "react";
import { classifyMerchant, normalizeMerchantName } from "../utils/merchantSectorMap";
import { rollUpSector, toEtfSectorName } from "../utils/sectorRollup";
import SignalChip from "./ui/SignalChip";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${Math.abs(v).toFixed(2)}`;
}

function tierTone(tier) {
  if (tier === "Tier 1") return "positive";
  if (tier === "Tier 2") return "market";
  if (tier === "Tier 3") return "neutral";
  return "neutral";
}

function parseDateAny(tx) {
  const raw =
    tx.date ??
    tx.Date ??
    tx.posted_at ??
    tx.PostedAt ??
    tx.timestamp ??
    tx.Timestamp ??
    tx.transactionDate ??
    tx.TransactionDate ??
    tx["Posting Date"] ??
    tx.PostingDate ??
    null;

  if (!raw) return null;

  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
  }

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let [, m, d, y] = slash;
    if (y.length === 2) y = `20${y}`;
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toISODate(dt) {
  if (!dt || Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function withinWindow(dt, timeframeDays, asOfDate, timeMode) {
  if (!dt) return false;

  const iso = asOfDate || new Date().toISOString().slice(0, 10);
  const parts = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  let end;

  if (parts) {
    const [, y, m, d] = parts;
    end =
      timeMode === "monthEnd"
        ? new Date(Number(y), Number(m), 0, 23, 59, 59, 999)
        : new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  } else {
    end = new Date();
    end.setHours(23, 59, 59, 999);
  }

  const start = new Date(end);
  start.setDate(start.getDate() - Number(timeframeDays || 30));
  start.setHours(0, 0, 0, 0);

  return dt >= start && dt <= end;
}

/**
 * AlignmentSnapshotDrip (Option A):
 * - Drip stays merchant-intuitive elsewhere
 * - Alignment aggregates by TICKER here (so "Target - location A/B" collapses to TGT)
 *
 * Tier logic:
 * - Tier 1: (Ticker is in Top 10 runners) AND (rolled-up sector is a Top 5 sector leader)
 * - Tier 2: Runner ticker only
 * - Tier 3: Sector leader only
 */
export default function AlignmentSnapshotDrip({
  transactions,
  sectorLeaders,
  personalRunners,
  timeframeDays = 30,
  asOfDate = "",
  timeMode = "trailing"
}) {
  const [showTierRules, setShowTierRules] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
// Use the same selected window for Alignment that Drip/Flow controls use.
const alignedTransactions = useMemo(() => {
  const arr = Array.isArray(transactions) ? transactions : [];

  const dated = arr
    .map((tx) => ({ tx, date: parseDateAny(tx) }))
    .filter((x) => x.date);

  if (!dated.length) return arr;

  return dated
    .filter((x) => withinWindow(x.date, timeframeDays, asOfDate, timeMode))
    .map((x) => x.tx);
}, [transactions, timeframeDays, asOfDate, timeMode]);

const uploadThrough = useMemo(() => {
  const dates = alignedTransactions
    .map(parseDateAny)
    .filter(Boolean)
    .sort((a, b) => b - a);

  return dates.length ? toISODate(dates[0]) : "";
}, [alignedTransactions]);

const timingText = uploadThrough
  ? `Your alignment uses uploaded spending through ${uploadThrough} and compares it with the selected ${timeframeDays}d market window as of ${
      asOfDate || "the latest available market date"
    }.`
  : `Your alignment uses the latest uploaded spending available and compares it with the selected ${timeframeDays}d market window.`;

// Build Top 10 tickers from transactions (by spend)
// Also keep one example merchant string for display.
const topTickers = useMemo(() => {
  const arr = Array.isArray(alignedTransactions) ? alignedTransactions : [];
  const map = new Map(); // ticker -> { amount, exampleMerchant, sectorBucket }

  for (const tx of arr) {
    const merchant = (tx.merchant || tx.Merchant || tx.name || tx.Name || tx.Description || "").toString().trim();
    const amount = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
    if (!merchant || !Number.isFinite(amount)) continue;

    const classified = classifyMerchant(merchant);
    const tkr = classified?.ticker ? String(classified.ticker).toUpperCase().trim() : "";
    if (!tkr) continue;

    const sectorBucket = classified?.sector || "Other / Unmapped";

    const prev = map.get(tkr);
    if (!prev) {
      map.set(tkr, { ticker: tkr, amount, exampleMerchant: normalizeMerchantName(merchant), sectorBucket });
    } else {
      prev.amount += amount;
      map.set(tkr, prev);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}, [alignedTransactions]);

  const sectorLeaderNames = useMemo(() => {
    const arr = Array.isArray(sectorLeaders) ? sectorLeaders : [];
    return new Set(arr.map((x) => String(x?.sectorName || "").trim()).filter(Boolean));
  }, [sectorLeaders]);

  const runnerSet = useMemo(() => {
    const arr = Array.isArray(personalRunners) ? personalRunners : [];
    return new Set(arr.map((t) => String(t || "").toUpperCase().trim()).filter(Boolean));
  }, [personalRunners]);

  const rows = useMemo(() => {
    return topTickers.map((t) => {
      const sectorBucket = t.sectorBucket || "Other / Unmapped";
      const rolled = rollUpSector(sectorBucket); // ✅ market bucket label
      const etfSector = toEtfSectorName(sectorBucket); // same as rolled, but safe

      const isSectorLeader = !!etfSector && sectorLeaderNames.has(etfSector);
      const isRunner = runnerSet.has(t.ticker);

      let tier = "—";
      let label = "No flag";
      let reason = "No Tier flag triggered (not in Top 5 sector leaders and not in Top 10 runners).";

      if (isSectorLeader && isRunner) {
        tier = "Tier 1";
        label = "Strong Alignment";
        reason = "Ticker is a Top 10 Runner AND its rolled-up sector is a Top 5 Sector Leader.";
      } else if (!isSectorLeader && isRunner) {
        tier = "Tier 2";
        label = "Runner Signal";
        reason = "Ticker is a Top 10 Runner (even if its sector is not a Top 5 leader).";
      } else if (isSectorLeader && !isRunner) {
        tier = "Tier 3";
        label = "Sector Strength";
        reason = "Rolled-up sector is a Top 5 Sector Leader (even if the ticker is not a Top 10 runner).";
      }

      return {
        ticker: t.ticker,
        amount: t.amount,
        exampleMerchant: t.exampleMerchant || "—",
        sectorBucket,
        rolledSector: rolled || "—",
        etfSector: etfSector || "—",
        tier,
        label,
        reason
      };
    });
  }, [topTickers, sectorLeaderNames, runnerSet]);

  if (!topTickers.length) {
    return (
      <div>
        <p style={{ marginTop: 0 }}>Upload transactions to populate alignment.</p>
      </div>
    );
  }

  return (
  <div>
    <div style={{ marginTop: 0, marginBottom: "0.75rem" }}>
  <div style={{ fontWeight: 900, marginBottom: 8 }}>
    Your spending compared with market leadership.
  </div>

  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  {Array.from(
    new Map(
      rows
        .filter((r) => r.tier && r.tier !== "—")
        .sort((a, b) => {
          const rank = {
            "Tier 1": 1,
            "Tier 2": 2,
            "Tier 3": 3
          };

          return (rank[a.tier] || 99) - (rank[b.tier] || 99);
        })
        .map((r) => [`${r.tier}-${r.label}`, r])
    ).values()
  )
    .slice(0, 4)
    .map((r) => (
      <SignalChip
        key={`${r.ticker}-${r.tier}`}
        label={`${r.tier}: ${r.label}`}
        tone={tierTone(r.tier)}
      />
    ))}
</div>
</div>

    <div
      style={{
        marginTop: "0.5rem",
        padding: "0.65rem",
        borderRadius: 10,
        background: "var(--s-ice, #eaf2f8)",
        border: "1px solid var(--s-divider, #d6dee6)",
        fontSize: "0.92rem",
        lineHeight: 1.45
      }}
    >
      <b>Timing note:</b> {timingText}
    </div>

      <div style={{ marginTop: "0.75rem" }}>
  <button
    type="button"
    onClick={() => setShowDetails((v) => !v)}
    style={{
      padding: "0.45rem 0.7rem",
      borderRadius: 10,
      border: "1px solid #ddd",
      cursor: "pointer",
      fontWeight: 800
    }}
  >
    {showDetails ? "Hide details" : "Show details"}
  </button>

  {showDetails ? (
    <div style={{ marginTop: "0.5rem", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.92rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Ticker</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Example Merchant</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Spend</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Spend Category</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Market Theme</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Signal</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker}>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  <b>{r.ticker}</b>
                </td>

                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  <span>{r.exampleMerchant}</span>
                </td>

                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{money(r.amount)}</td>

                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{r.sectorBucket}</td>

                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  <b>{r.rolledSector}</b>
                </td>

                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{r.etfSector}</td>

                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  <SignalChip
  label={r.tier === "—" ? "No signal" : r.label}
  tone={tierTone(r.tier)}
/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
          <button
            onClick={() => setShowTierRules((v) => !v)}
            style={{ padding: "0.45rem 0.7rem", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
          >
            {showTierRules ? "Hide tier rules" : "Show tier rules"}
          </button>

          {showTierRules ? (
            <div style={{ marginTop: "0.6rem" }}>
              <b>Tier rules:</b>
              <ul style={{ marginTop: "0.35rem" }}>
                <li>
                  <b>Tier 1</b>: runner ticker + sector leader (market bucket)
                </li>
                <li>
                  <b>Tier 2</b>: runner ticker only
                </li>
                <li>
                  <b>Tier 3</b>: sector leader only
                </li>
              </ul>
              <div style={{ marginTop: "0.35rem" }}>Tier flags are informational only — not recommendations.</div>
            </div>
          ) : null}
                </div>
      </div>
    ) : null}
  </div>
</div>
  );
}
