// FILE: src/components/MonthlyDrip.jsx
import { useEffect, useMemo, useState } from "react";
import { UI, SummaryBand, SubHeaderRow, TextLink } from "./SectionUI";
import { classifyMerchant, normalizeMerchantName } from "../utils/merchantSectorMap";

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

  // Handles YYYY-MM-DD without timezone drift
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
  }

  // Handles 1/12/2026 or 01/12/2026
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let [, m, d, y] = slash;
    if (y.length === 2) y = `20${y}`;
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
  }

  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;

  return dt;
}

function endOfMonth(dateISO) {
  const dt = new Date(dateISO);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999);
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

function withinWindow(dt, { timeframeDays, asOfDate, timeMode }) {
  if (!dt) return false;

  const iso = asOfDate || new Date().toISOString().slice(0, 10);
  const asOfParts = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  let end;
  if (asOfParts) {
    const [, y, m, d] = asOfParts;
    end =
      timeMode === "monthEnd"
        ? new Date(Number(y), Number(m), 0, 23, 59, 59, 999)
        : new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  } else {
    end = new Date(iso);
    end.setHours(23, 59, 59, 999);
  }

  if (Number.isNaN(end.getTime())) return true;

  const start = new Date(end);
  start.setDate(start.getDate() - Number(timeframeDays || 30));
  start.setHours(0, 0, 0, 0);

  return dt >= start && dt <= end;
}

function getMerchant(tx) {
  // supports your banking formats: Description is typically merchant
  return (
    tx.merchant ||
    tx.Merchant ||
    tx.name ||
    tx.Name ||
    tx.description ||
    tx.Description ||
    tx["Description"] ||
    ""
  )
    .toString()
    .trim();
}

// --- Spend-only normalization ---
// Rules:
// - If transaction indicates CREDIT (income/refund), ignore it (return null).
// - If amount is negative, treat absolute value as spend.
// - If amount is positive but explicitly marked DEBIT, keep it as spend.
// - If unclear, treat negative as spend, and positive as spend ONLY if no "credit" indicator exists.
function getSpend(tx) {
  const rawAmount = tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? tx["Amount"] ?? 0;
  const amount = Number(typeof rawAmount === "string" ? rawAmount.replace(/[$,]/g, "").trim() : rawAmount);
  if (!Number.isFinite(amount)) return null;

  const details = String(tx.Details ?? tx["Details"] ?? "").toLowerCase();
  const dirType = String(tx.direction ?? tx.Direction ?? tx["Direction"] ?? "").toLowerCase();
  const creditDebit = String(tx.creditDebit ?? tx.CreditDebit ?? tx["Credit/Debit"] ?? "").toLowerCase();

  const explicitCredit =
    details.includes("credit") ||
    dirType.includes("credit") ||
    creditDebit.includes("credit") ||
    details.includes("refund") ||
    details.includes("reversal");

  const explicitDebit =
    details.includes("debit") || dirType.includes("debit") || creditDebit.includes("debit");

  // Credits are not "spend" for Drip
  if (explicitCredit && !explicitDebit) return null;

  // If bank exports debits as negative
  if (amount < 0) return Math.abs(amount);

  // If explicitly debit, allow positive spend
  if (explicitDebit) return amount;

  // If unclear and positive, treat as spend only if not explicitly credit
  return explicitCredit ? null : amount;
}

function aggregateByMerchant(txs) {
  const map = new Map();
  for (const tx of txs) {
    const merchant = normalizeMerchantName(getMerchant(tx));
    const spend = getSpend(tx);
    if (!merchant || spend === null) continue;
    map.set(merchant, (map.get(merchant) || 0) + spend);
  }
  return Array.from(map.entries())
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function aggregateBySector(txs) {
    const map = new Map();
  for (const tx of txs) {
    const merchant = normalizeMerchantName(getMerchant(tx));
    const spend = getSpend(tx);
    if (!merchant || spend === null) continue;

    const { sector } = classifyMerchant(merchant);
    map.set(sector, (map.get(sector) || 0) + spend);
  }
  return Array.from(map.entries())
    .map(([sector, amount]) => ({ sector, amount }))
    .sort((a, b) => b.amount - a.amount)
    .filter((x) => x.sector && x.sector !== "Other / Unmapped");
}

/**
 * MonthlyDrip (Dated timeframe) + All-time (Undated)
 *
 * Dated txs:
 * - obey timeframeDays + asOfDate + timeMode
 *
 * Undated txs:
 * - treated as all-time totals
 * - shown separately so timeframe controls remain truthful
 *
 * onTopSectorsChange:
 * - uses dated top sectors if available, else falls back to undated top sectors
 */
export default function MonthlyDrip({
  transactions,
  onTopSectorsChange,
  timeframeDays = 30,
  asOfDate,
  timeMode = "trailing"
}) {
  const arr = useMemo(() => (Array.isArray(transactions) ? transactions : []), [transactions]);

  // Partition: dated vs undated
  const { datedInWindow, undated } = useMemo(() => {
    const datedInWindow = [];
    const undated = [];

    const opts = { timeframeDays, asOfDate, timeMode };

    for (const tx of arr) {
      const dt = parseDateAny(tx);
      if (!dt) {
        undated.push(tx);
        continue;
      }
      if (withinWindow(dt, opts)) datedInWindow.push(tx);
    }

    return { datedInWindow, undated };
  }, [arr, timeframeDays, asOfDate, timeMode]);

  // Expand/collapse
  const [openMerchants, setOpenMerchants] = useState(false);
  const [openSectors, setOpenSectors] = useState(false);
  const [openAllTime, setOpenAllTime] = useState(false);

  // Show all toggles
  const [showAllMerchants, setShowAllMerchants] = useState(false);
  const [showAllSectors, setShowAllSectors] = useState(false);
  const [showAllAllTimeMerchants, setShowAllAllTimeMerchants] = useState(false);
  const [showAllAllTimeSectors, setShowAllAllTimeSectors] = useState(false);

  // ---------- Dated timeframe aggregates ----------
  const allMerchantsWindow = useMemo(() => aggregateByMerchant(datedInWindow), [datedInWindow]);
  const top10MerchantsWindow = useMemo(() => allMerchantsWindow.slice(0, 10), [allMerchantsWindow]);

  const allSectorsWindow = useMemo(() => aggregateBySector(datedInWindow), [datedInWindow]);
  const top5SectorsWindow = useMemo(() => allSectorsWindow.slice(0, 5), [allSectorsWindow]);
  const highestSectorWindow = useMemo(() => top5SectorsWindow?.[0]?.sector || "—", [top5SectorsWindow]);

  // ---------- All-time (undated) aggregates ----------
  const allMerchantsAllTime = useMemo(() => aggregateByMerchant(undated), [undated]);
  const top10MerchantsAllTime = useMemo(() => allMerchantsAllTime.slice(0, 10), [allMerchantsAllTime]);

  const allSectorsAllTime = useMemo(() => aggregateBySector(undated), [undated]);
  const top5SectorsAllTime = useMemo(() => allSectorsAllTime.slice(0, 5), [allSectorsAllTime]);
  const highestSectorAllTime = useMemo(() => top5SectorsAllTime?.[0]?.sector || "—", [top5SectorsAllTime]);

  // Notify parent: dated sectors if any, else undated all-time sectors
  useEffect(() => {
    if (typeof onTopSectorsChange !== "function") return;

    const useDated = top5SectorsWindow.length > 0;
    const list = (useDated ? top5SectorsWindow : top5SectorsAllTime).map((x) => x.sector);

    onTopSectorsChange(list);
  }, [top5SectorsWindow, top5SectorsAllTime, onTopSectorsChange]);

  const merchantsToShowWindow = showAllMerchants ? allMerchantsWindow : top10MerchantsWindow;
  const sectorsToShowWindow = showAllSectors ? allSectorsWindow : top5SectorsWindow;

  const merchantsToShowAllTime = showAllAllTimeMerchants ? allMerchantsAllTime : top10MerchantsAllTime;
  const sectorsToShowAllTime = showAllAllTimeSectors ? allSectorsAllTime : top5SectorsAllTime;

  // Totals
  const totalSpendWindow = useMemo(() => {
    let sum = 0;
    for (const tx of datedInWindow) {
      const s = getSpend(tx);
      if (s === null) continue;
      sum += s;
    }
    return sum;
  }, [datedInWindow]);

  const totalSpendAllTime = useMemo(() => {
    let sum = 0;
    for (const tx of undated) {
      const s = getSpend(tx);
      if (s === null) continue;
      sum += s;
    }
    return sum;
  }, [undated]);

  const topMerchantTotalWindow = useMemo(() => {
    return top10MerchantsWindow.reduce((acc, x) => acc + (Number.isFinite(x.amount) ? x.amount : 0), 0);
  }, [top10MerchantsWindow]);

  const topSectorTotalWindow = useMemo(() => {
    return top5SectorsWindow.reduce((acc, x) => acc + (Number.isFinite(x.amount) ? x.amount : 0), 0);
  }, [top5SectorsWindow]);

  const topMerchantTotalAllTime = useMemo(() => {
    return top10MerchantsAllTime.reduce((acc, x) => acc + (Number.isFinite(x.amount) ? x.amount : 0), 0);
  }, [top10MerchantsAllTime]);

  const topSectorTotalAllTime = useMemo(() => {
    return top5SectorsAllTime.reduce((acc, x) => acc + (Number.isFinite(x.amount) ? x.amount : 0), 0);
  }, [top5SectorsAllTime]);

  const hasDated = datedInWindow.length > 0;
  const hasAllTime = undated.length > 0;

    return (
    <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.45 }}>
      <p style={{ marginTop: 0, fontSize: UI.FONT_BODY }}>
  Your personal spending snapshot for this window.
</p>

      {/* DATED TIMEFRAME SUMMARY */}
      <SummaryBand>
  <div style={{ fontSize: UI.FONT_BODY }}>
    <b>Snapshot:</b>{" "}
    {hasDated ? (
      <>
        We found <b>{datedInWindow.length}</b> dated transactions in this window. Your largest spending area was{" "}
        <b>{highestSectorWindow}</b>.
      </>
    ) : arr.length ? (
      <>
        We found uploaded transactions, but none matched this selected window. Try changing the as-of date or widening the
        timeframe.
      </>
    ) : (
      <>Upload transactions to generate your Drip summary.</>
    )}
  </div>

  <div style={{ marginTop: 6, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
    Timeframe spend (dated): <b>{money(totalSpendWindow)}</b> · Top 10 merchants:{" "}
    <b>{money(topMerchantTotalWindow)}</b> · Top 5 sectors: <b>{money(topSectorTotalWindow)}</b>
  </div>

  {hasAllTime ? (
    <div style={{ marginTop: 6, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
      All-time spend (undated uploads): <b>{money(totalSpendAllTime)}</b> · Top 10 merchants:{" "}
      <b>{money(topMerchantTotalAllTime)}</b> · Top 5 sectors: <b>{money(topSectorTotalAllTime)}</b>
    </div>
  ) : null}
</SummaryBand>

      {/* DATED TIMEFRAME MERCHANTS */}
      <SubHeaderRow
        title="Top Merchants"
        open={openMerchants}
        onToggle={() => setOpenMerchants((v) => !v)}
        rightSlot={
          allMerchantsWindow.length > 10 ? (
            <TextLink onClick={() => setShowAllMerchants((v) => !v)}>{showAllMerchants ? "Show top 10" : "Show all"}</TextLink>
          ) : null
        }
      />

      {!hasDated ? (
        <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
          No dated transactions in this timeframe. (Undated uploads are tracked as All-time below.)
        </p>
      ) : openMerchants ? (
        <div style={{ marginTop: "0.5rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: UI.FONT_BODY }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>#</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Merchant</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>Spend</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Mapped Sector</th>
              </tr>
            </thead>
            <tbody>
              {merchantsToShowWindow.map((x, idx) => {
                const sector = classifyMerchant(x.merchant)?.sector || "Other / Unmapped";
                return (
                  <tr key={x.merchant}>
                    <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{idx + 1}</td>
                    <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                      <b>{x.merchant}</b>
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: "8px", textAlign: "right" }}>
                      {money(x.amount)}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{sector}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* DATED TIMEFRAME SECTORS */}
      <SubHeaderRow
        title="Top Sectors"
        open={openSectors}
        onToggle={() => setOpenSectors((v) => !v)}
        rightSlot={
          allSectorsWindow.length > 5 ? (
            <TextLink onClick={() => setShowAllSectors((v) => !v)}>{showAllSectors ? "Show top 5" : "Show all"}</TextLink>
          ) : null
        }
      />

      {!hasDated ? (
        <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
          No dated transactions in this timeframe. (Undated uploads are tracked as All-time below.)
        </p>
      ) : openSectors ? (
        <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
          {sectorsToShowWindow.map((x) => (
            <li key={x.sector} style={{ marginBottom: "0.25rem" }}>
              <b>{x.sector}</b> — {money(x.amount)}
            </li>
          ))}
        </ol>
      ) : null}

      {/* ALL-TIME (UNDATED) */}
      <SubHeaderRow
        title="All-time totals (undated uploads)"
        open={openAllTime}
        onToggle={() => setOpenAllTime((v) => !v)}
      />

      {!hasAllTime ? (
        <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
          No undated uploads detected. (If you upload without a date column, those rows show up here.)
        </p>
      ) : openAllTime ? (
        <div style={{ marginTop: "0.5rem" }}>
          <div style={{ fontSize: UI.FONT_BODY, marginBottom: "0.5rem" }}>
            <b>All-time insight:</b> Your <b>undated</b> spending clustered in <b>{highestSectorAllTime}</b>.
          </div>

          <SubHeaderRow
            title="Top 10 Merchants (All-time · undated)"
            open={true}
            onToggle={() => {}}
            rightSlot={
              allMerchantsAllTime.length > 10 ? (
                <TextLink onClick={() => setShowAllAllTimeMerchants((v) => !v)}>
                  {showAllAllTimeMerchants ? "Show top 10" : "Show all"}
                </TextLink>
              ) : null
            }
          />

          <div style={{ marginTop: "0.35rem", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: UI.FONT_BODY }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>#</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Merchant</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>Spend</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Mapped Sector</th>
                </tr>
              </thead>
              <tbody>
                {merchantsToShowAllTime.map((x, idx) => {
                  const sector = classifyMerchant(x.merchant)?.sector || "Other / Unmapped";
                  return (
                    <tr key={"alltime-m-" + x.merchant}>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{idx + 1}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                        <b>{x.merchant}</b>
                      </td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px", textAlign: "right" }}>
                        {money(x.amount)}
                      </td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{sector}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <SubHeaderRow
            title="Top Sectors (All-time · undated)"
            open={true}
            onToggle={() => {}}
            rightSlot={
              allSectorsAllTime.length > 5 ? (
                <TextLink onClick={() => setShowAllAllTimeSectors((v) => !v)}>
                  {showAllAllTimeSectors ? "Show top 5" : "Show all"}
                </TextLink>
              ) : null
            }
          />

          <ol style={{ marginTop: "0.35rem", fontSize: UI.FONT_BODY }}>
            {sectorsToShowAllTime.map((x) => (
              <li key={"alltime-s-" + x.sector} style={{ marginBottom: "0.25rem" }}>
                <b>{x.sector}</b> — {money(x.amount)}
              </li>
            ))}
          </ol>

          <div style={{ marginTop: "0.5rem", fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
            Note: Undated uploads are treated as All-time and do not respond to timeframe controls.
          </div>
        </div>
      ) : null}
    </div>
  );
}
