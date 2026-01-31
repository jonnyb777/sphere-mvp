// FILE: src/components/AlignmentSnapshotDrip.jsx
import { useMemo, useState } from "react";
import { classifyMerchant } from "../utils/merchantSectorMap";
import { rollUpSector, toEtfSectorName } from "../utils/sectorRollup";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
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
export default function AlignmentSnapshotDrip({ transactions, sectorLeaders, personalRunners }) {
  const [showTierRules, setShowTierRules] = useState(false);

  // Build Top 10 tickers from transactions (by spend)
  // Also keep one example merchant string for display.
  const topTickers = useMemo(() => {
    const arr = Array.isArray(transactions) ? transactions : [];
    const map = new Map(); // ticker -> { amount, exampleMerchant, sectorBucket }

    for (const tx of arr) {
      const merchant = (tx.merchant || tx.Merchant || tx.name || tx.Name || tx.Description || "").toString().trim();
      const amount = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
      if (!merchant || !Number.isFinite(amount)) continue;

      const classified = classifyMerchant(merchant);
      const tkr = classified?.ticker ? String(classified.ticker).toUpperCase().trim() : "";
      if (!tkr) continue; // if no ticker mapping, it can't aggregate by ticker

      const sectorBucket = classified?.sector || "Other / Unmapped";

      const prev = map.get(tkr);
      if (!prev) {
        map.set(tkr, { ticker: tkr, amount, exampleMerchant: merchant, sectorBucket });
      } else {
        prev.amount += amount;
        // keep the first example merchant we saw (stable display)
        map.set(tkr, prev);
      }
    }

    return Array.from(map.values())
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
      <p style={{ marginTop: 0 }}>
        Alignment shows how your spending overlaps with market sector leadership and your runner list.
      </p>

      <div style={{ marginTop: "0.5rem", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.92rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Ticker</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Example Merchant</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Spend</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Spend Category</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Market Bucket</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Sector Leader Proxy</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Tier</th>
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
                  <b>{r.tier}</b>
                  <div style={{ fontStyle: "italic", marginTop: 2 }}>{r.label}</div>
                  <div style={{ fontSize: "0.85rem", marginTop: 4 }}>{r.reason}</div>
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
    </div>
  );
}
