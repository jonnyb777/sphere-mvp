// FILE: src/components/MonthlyFlow.jsx
import { useEffect, useMemo, useState } from "react";
import { UI, SectionBand, SummaryBand, SubHeaderRow, usePersistedBool } from "./SectionUI";

function pct(n) {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function maxDate(dates) {
  const parsed = dates
    .map((d) => new Date(d))
    .filter((x) => !Number.isNaN(x.getTime()));
  if (!parsed.length) return null;
  parsed.sort((a, b) => b.getTime() - a.getTime());
  return parsed[0].toISOString().slice(0, 10);
}

async function fetchJsonStrict(url) {
  const res = await fetch(url, { cache: "no-store" });
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!ct.includes("application/json")) {
    throw new Error(
      `Non-JSON response for ${url}\nContent-Type: ${ct || "unknown"}\nFirst chars: ${text.slice(0, 80)}`
    );
  }
  return JSON.parse(text);
}

// ---------- Flow-specific helpers ----------
const sectorEtfs = [
  { ticker: "XLC", name: "Communication Services" },
  { ticker: "XLY", name: "Consumer Discretionary" },
  { ticker: "XLP", name: "Consumer Staples" },
  { ticker: "XLE", name: "Energy" },
  { ticker: "XLF", name: "Financials" },
  { ticker: "XLV", name: "Healthcare" },
  { ticker: "XLI", name: "Industrials" },
  { ticker: "XLB", name: "Materials" },
  { ticker: "XLK", name: "Technology" },
  { ticker: "XLU", name: "Utilities" },
  { ticker: "XLRE", name: "Real Estate" }
];

const SIGNAL_EXPLAINER_PREVIEW = [
  {
    title: "High spend concentration",
    body:
      "A larger share of total community spend is clustering in that sector compared to other sectors (aggregate-only)."
  },
  {
    title: "Moderate concentration",
    body:
      "Community spend clusters in that sector, but not overwhelmingly versus others (aggregate-only)."
  },
  {
    title: "Broad-based",
    body:
      "Spend is spread across multiple sectors rather than clustering strongly into one (aggregate-only)."
  },
  {
    title: "High breadth",
    body:
      "Many distinct merchants/brands contribute to the sector’s signal (more diversified community behavior)."
  },
  {
    title: "Medium breadth",
    body:
      "A moderate number of merchants/brands contribute to the sector’s signal."
  },
  {
    title: "Narrow breadth",
    body:
      "Fewer merchants/brands contribute to the signal (more concentrated community behavior)."
  },
  {
    title: "Stable",
    body:
      "The aggregate signal is persistent across recent periods (less noisy)."
  },
  {
    title: "Emerging",
    body:
      "The signal appears to be strengthening recently (developing trend)."
  },
  {
    title: "Spiky",
    body:
      "The signal is more volatile or event-driven (more noisy)."
  }
];

const SIGNAL_LINE_READER =
  "How to read the full Signal line: Signals are a 3-part label: (1) concentration = how clustered spend is, (2) breadth = how many distinct merchants contribute, (3) stability = how persistent the signal is over time. Example: “High spend concentration · Narrow breadth · Stable” means community spend is clustered into that sector, driven by fewer merchants, and the pattern has persisted across recent periods.";

const EXTRA_SIGNALS = [
  {
    title: "Momentum spillover",
    body:
      "Often appears when a broader sector/theme is moving and related names get pulled along. This is a correlation-style flag, not a causal claim."
  },
  {
    title: "Stable breadth",
    body:
      "Community activity is spread across multiple names within a sector (more diversified behavior)."
  },
  {
    title: "Narrow breadth (tag)",
    body:
      "Community activity is concentrated in fewer names within the sector (more concentrated behavior)."
  }
];

// Best-effort mapping: Flow bucket -> ETF sector leader label (matches sectorEtfs names)
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

// Parse "A · B · C" into parts
function splitSignalLine(signal) {
  const s = String(signal || "").trim();
  if (!s || s === "—") return { raw: "—", parts: [] };
  const parts = s
    .split("·")
    .map((x) => x.trim())
    .filter(Boolean);
  return { raw: s, parts };
}

export default function MonthlyFlow({
  userSpendTickers,
  userRunners,
  onCommunityTopSectorsChange,
  onCommunityRunnersChange,
  section = "all" // "all" | "monthly" | "pulse" | "alignment"
}) {
  // If we're embedded inside Home's <Section>, Home already renders the header band.
  // So: don't render SectionBand or gate content on openMonthly/openPulse/openAlign in embedded mode.
  const embedded = section !== "all";

  const [communityItems, setCommunityItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [flowError, setFlowError] = useState("");

  const [sectorLeaders, setSectorLeaders] = useState([]);
  const [leadersLoading, setLeadersLoading] = useState(false);

  // Persistent open/closed states (Flow tab) — still kept for "all" mode
  const [openMonthly, setOpenMonthly] = usePersistedBool("sphere:flow:open:monthly", true);
  const [openPulse, setOpenPulse] = usePersistedBool("sphere:flow:open:pulse", true);
  const [openAlign, setOpenAlign] = usePersistedBool("sphere:flow:open:alignment", true);

  // Monthly subsection toggles (triangle only)
  const [openMonthlyMerchants, setOpenMonthlyMerchants] = usePersistedBool(
    "sphere:flow:open:monthly:merchants",
    false
  );
  const [openMonthlySectors, setOpenMonthlySectors] = usePersistedBool(
    "sphere:flow:open:monthly:sectors",
    false
  );

  // Signals explained (triangle only)
  const [openSignalsExplained, setOpenSignalsExplained] = usePersistedBool(
    "sphere:flow:open:signalsExplained",
    false
  );

  const showMonthly = section === "all" || section === "monthly";
  const showPulse = section === "all" || section === "pulse";
  const showAlign = section === "all" || section === "alignment";

  // Load admin-fed community file
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setFlowError("");
      try {
        const json = await fetchJsonStrict("/community-flow.json");
        const arr = Array.isArray(json) ? json : [];
        setCommunityItems(arr);
      } catch (e) {
        console.error("MonthlyFlow load error:", e);
        setCommunityItems([]);
        setFlowError(String(e?.message || "Flow feed error"));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const normalizedCommunity = useMemo(() => {
    return (Array.isArray(communityItems) ? communityItems : [])
      .map((x) => ({
        ticker: String(x.ticker || "").toUpperCase().trim(),
        sector: String(x.sector || "Other / Unmapped"),
        signal: String(x.signal || "—"),
        count: Number(x.count ?? 0)
      }))
      .filter((x) => x.ticker && x.sector && Number.isFinite(x.count));
  }, [communityItems]);

  // Map ticker -> best record (highest count)
  const communityByTicker = useMemo(() => {
    const map = new Map();
    for (const x of normalizedCommunity) {
      const prev = map.get(x.ticker);
      if (!prev || (Number.isFinite(x.count) && x.count > prev.count)) {
        map.set(x.ticker, x);
      }
    }
    return map;
  }, [normalizedCommunity]);

  const communityTopSectors = useMemo(() => {
    const map = new Map();
    for (const x of normalizedCommunity) {
      const s = String(x.sector || "Other / Unmapped");
      const c = Number(x.count ?? 0);
      map.set(s, (map.get(s) || 0) + (Number.isFinite(c) ? c : 0));
    }
    const sorted = Array.from(map.entries())
      .map(([sector, score]) => ({ sector, score }))
      .sort((a, b) => b.score - a.score)
      .filter((x) => x.sector && x.sector !== "Other / Unmapped");
    return sorted.slice(0, 5).map((x) => x.sector);
  }, [normalizedCommunity]);

  const narrativeHighestSector = useMemo(() => communityTopSectors[0] || "—", [communityTopSectors]);

  const top10CommunityMerchants = useMemo(() => {
    const sorted = [...normalizedCommunity].sort((a, b) => b.count - a.count);
    const chosen = [];
    const seen = new Set();
    for (const x of sorted) {
      if (chosen.length >= 10) break;
      if (!x.ticker || seen.has(x.ticker)) continue;
      chosen.push(x);
      seen.add(x.ticker);
    }
    // alphabetize by sector, then ticker (your latest rule)
    return chosen.sort((a, b) => {
      const s = String(a.sector || "").localeCompare(String(b.sector || ""), undefined, { sensitivity: "base" });
      if (s !== 0) return s;
      return String(a.ticker || "").localeCompare(String(b.ticker || ""), undefined, { sensitivity: "base" });
    });
  }, [normalizedCommunity]);

  // Community runners (kept; 2-per-sector enforcement lives elsewhere)
  const top10CommunityRunners = useMemo(() => {
    const topSet = new Set(communityTopSectors);
    const preferred = normalizedCommunity.filter((x) => topSet.has(x.sector));
    const pool = preferred.length ? preferred : normalizedCommunity;

    const sorted = [...pool].sort((a, b) => b.count - a.count);
    const chosen = [];
    const seen = new Set();

    for (const x of sorted) {
      if (chosen.length >= 10) break;
      if (!x.ticker || seen.has(x.ticker)) continue;
      chosen.push(x);
      seen.add(x.ticker);
    }

    // Alphabetize display by sector, then ticker
    return chosen.sort((a, b) => {
      const s = String(a.sector || "").localeCompare(String(b.sector || ""), undefined, { sensitivity: "base" });
      if (s !== 0) return s;
      return String(a.ticker || "").localeCompare(String(b.ticker || ""), undefined, { sensitivity: "base" });
    });
  }, [normalizedCommunity, communityTopSectors]);

  useEffect(() => {
    if (typeof onCommunityTopSectorsChange === "function") onCommunityTopSectorsChange(communityTopSectors);
  }, [communityTopSectors, onCommunityTopSectorsChange]);

  useEffect(() => {
    if (typeof onCommunityRunnersChange === "function") onCommunityRunnersChange(top10CommunityRunners);
  }, [top10CommunityRunners, onCommunityRunnersChange]);

  // Fetch sector leader ETFs
  useEffect(() => {
    const run = async () => {
      setLeadersLoading(true);
      try {
        const etfTickers = sectorEtfs.map((s) => s.ticker).join(",");
        const json = await fetchJsonStrict(`/.netlify/functions/market?tickers=${encodeURIComponent(etfTickers)}`);
        const items = Array.isArray(json.items) ? json.items : [];
        items.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));
        const top5 = items.slice(0, 5).map((x) => ({
          ...x,
          sectorName: sectorEtfs.find((s) => s.ticker === x.ticker)?.name || "Sector"
        }));
        setSectorLeaders(top5);
      } catch (e) {
        console.error("MonthlyFlow sector leaders error:", e);
        setSectorLeaders([]);
      } finally {
        setLeadersLoading(false);
      }
    };
    run();
  }, []);

  const asOf = useMemo(() => maxDate(sectorLeaders.map((x) => x.latestDate).filter(Boolean)), [sectorLeaders]);

  // ---------- Alignment inputs ----------
  const userSpend = useMemo(() => {
    return (Array.isArray(userSpendTickers) ? userSpendTickers : [])
      .map((x) => String(x || "").toUpperCase().trim())
      .filter(Boolean);
  }, [userSpendTickers]);

  const userRunnersTickers = useMemo(() => {
    return (Array.isArray(userRunners) ? userRunners : [])
      .map((x) => String(x || "").toUpperCase().trim())
      .filter(Boolean);
  }, [userRunners]);

  const communitySpendTickers = useMemo(() => {
    const topSet = new Set(communityTopSectors);
    const tickers = normalizedCommunity.filter((x) => topSet.has(x.sector)).map((x) => x.ticker);
    return Array.from(new Set(tickers)).sort();
  }, [normalizedCommunity, communityTopSectors]);

  const communityRunnerTickers = useMemo(() => {
    return top10CommunityRunners.map((x) => x.ticker).filter(Boolean);
  }, [top10CommunityRunners]);

  const intersect = (a, b) => {
    const setB = new Set(b);
    return a.filter((x) => setB.has(x));
  };

  const alignSpendVsCommunitySpend = useMemo(
    () => intersect(userSpend, communitySpendTickers),
    [userSpend, communitySpendTickers]
  );

  const alignSpendVsCommunityRunners = useMemo(
    () => intersect(userSpend, communityRunnerTickers),
    [userSpend, communityRunnerTickers]
  );

  const overlapPersonalVsFlowRunners = useMemo(
    () => intersect(userRunnersTickers, communityRunnerTickers),
    [userRunnersTickers, communityRunnerTickers]
  );

  const leaderNames = useMemo(() => {
    return new Set(
      (Array.isArray(sectorLeaders) ? sectorLeaders : [])
        .map((x) => String(x?.sectorName || "").trim())
        .filter(Boolean)
    );
  }, [sectorLeaders]);

  // ---------- Robust Flow Alignment (SIGNAL-driven) ----------
  const robustFlowRows = useMemo(() => {
    const spendSet = new Set(communitySpendTickers);
    const runnerSet = new Set(communityRunnerTickers);

    const tickers = [...userSpend].slice(0, 25);

    return tickers.map((tkr, idx) => {
      const meta = communityByTicker.get(tkr) || null;
      const sectorBucket = meta?.sector || "—";
      const etfSector = bucketToEtfSectorName(sectorBucket);
      const isLeader = !!etfSector && leaderNames.has(etfSector);

      const isCommunitySpend = spendSet.has(tkr);
      const isRunner = runnerSet.has(tkr);

      const sig = splitSignalLine(meta?.signal);
      const count = Number.isFinite(meta?.count) ? meta.count : null;

      let trigger = "No signal overlap.";
      if (isRunner && isCommunitySpend) trigger = "Runner + Community spend sector overlap.";
      else if (isRunner) trigger = "Runner overlap.";
      else if (isCommunitySpend) trigger = "Community spend sector overlap.";

      return {
        idx: idx + 1,
        ticker: tkr,
        sectorBucket,
        signalRaw: sig.raw,
        signalParts: sig.parts,
        count,
        etfSector: etfSector || "—",
        flags: {
          leader: isLeader,
          communitySpend: isCommunitySpend,
          runner: isRunner,
          trigger
        }
      };
    });
  }, [userSpend, communityByTicker, communitySpendTickers, communityRunnerTickers, leaderNames]);

  // In embedded mode, parent <Section> controls collapse, so always render the body.
  const allowMonthlyBody = embedded ? true : openMonthly;
  const allowPulseBody = embedded ? true : openPulse;
  const allowAlignBody = embedded ? true : openAlign;

  return (
    <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.45 }}>
      {flowError ? (
        <div
          style={{
            marginBottom: "0.9rem",
            padding: "0.75rem",
            background: "#fff1f1",
            border: "1px solid #ffd4d4",
            borderRadius: UI.RADIUS_SOFT,
            fontSize: UI.FONT_BODY
          }}
        >
          <b>Flow feed error:</b>
          <div style={{ marginTop: "0.25rem", fontSize: UI.FONT_BODY, whiteSpace: "pre-wrap" }}>{flowError}</div>
        </div>
      ) : null}

      {/* MONTHLY */}
      {showMonthly ? (
        <div>
          {!embedded ? (
            <SectionBand title="Monthly Flow (Paid • Preview)" open={openMonthly} onToggle={() => setOpenMonthly((v) => !v)} />
          ) : null}

          {allowMonthlyBody ? (
            <div style={{ paddingTop: embedded ? 0 : "0.75rem" }}>
              <p style={{ marginTop: 0, fontSize: UI.FONT_BODY }}>
                Monthly Flow is part of the paid Flow subscription. This preview shows anonymized community-wide
                aggregate trends — admin fed.
              </p>

              <SummaryBand>
                <b>Community insight:</b> This month, the highest concentration of community spending was in{" "}
                <b>{narrativeHighestSector}</b>.
              </SummaryBand>

              <SubHeaderRow
                title="Top 10 Merchants (Community)"
                open={openMonthlyMerchants}
                onToggle={() => setOpenMonthlyMerchants((v) => !v)}
              />

              {!top10CommunityMerchants.length ? (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
                  No community merchant data yet (admin aggregate feed not populated).
                </p>
              ) : openMonthlyMerchants ? (
                <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
                  {top10CommunityMerchants.map((x) => (
                    <li key={x.ticker} style={{ marginBottom: "0.25rem" }}>
                      <b>{x.sector}</b> — {x.ticker}{" "}
                      <span style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>(Signal: {x.signal})</span>
                    </li>
                  ))}
                </ol>
              ) : null}

              <SubHeaderRow
                title="Top Sectors (Community Spend)"
                open={openMonthlySectors}
                onToggle={() => setOpenMonthlySectors((v) => !v)}
              />

              {loading ? (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>Loading community feed…</p>
              ) : !communityTopSectors.length ? (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
                  No community sectors shown yet (admin aggregate feed not populated).
                </p>
              ) : openMonthlySectors ? (
                <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
                  {[...communityTopSectors]
                    .slice()
                    .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }))
                    .map((s) => (
                      <li key={s} style={{ marginBottom: "0.25rem" }}>
                        <b>{s}</b>
                      </li>
                    ))}
                </ol>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* PULSE */}
      {showPulse ? (
        <div style={{ marginTop: embedded ? 0 : "1rem" }}>
          {!embedded ? (
            <SectionBand title="Market Pulse (Trailing 30 Days)" open={openPulse} onToggle={() => setOpenPulse((v) => !v)} />
          ) : null}

          {allowPulseBody ? (
            <div style={{ paddingTop: embedded ? 0 : "0.75rem" }}>
              <SummaryBand>
                <b>As of:</b> {asOf || "—"} {leadersLoading ? "(Loading…)" : ""}
              </SummaryBand>

              <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 800, marginTop: "0.25rem" }}>
                Top 5 Sector Leaders (30D) — ETF Proxies
              </div>

              {sectorLeaders.length ? (
                <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
                  {sectorLeaders
                    .slice()
                    .sort((a, b) =>
                      String(a.sectorName || "").localeCompare(String(b.sectorName || ""), undefined, {
                        sensitivity: "base"
                      })
                    )
                    .map((x) => (
                      <li key={x.ticker} style={{ marginBottom: "0.25rem" }}>
                        <b>{x.sectorName}</b> ({x.ticker}): <b>{pct(x.return30d)}</b>
                      </li>
                    ))}
                </ol>
              ) : (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>No sector leader data yet.</p>
              )}

              <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 800, marginTop: "1rem" }}>
                Top 10 Runners (30D) — Based on Community Top Spend Sectors
              </div>

              {top10CommunityRunners.length ? (
                <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
                  {top10CommunityRunners.map((x) => (
                    <li key={x.ticker} style={{ marginBottom: "0.25rem" }}>
                      <b>{x.sector}</b> — {x.ticker}{" "}
                      <span style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>(Signal: {x.signal})</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
                  No community runners shown yet (admin aggregate feed not populated).
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ALIGNMENT */}
      {showAlign ? (
        <div style={{ marginTop: embedded ? 0 : "1rem" }}>
          {!embedded ? (
            <SectionBand title="Alignment Snapshot (Flow)" open={openAlign} onToggle={() => setOpenAlign((v) => !v)} />
          ) : null}

          {allowAlignBody ? (
            <div style={{ paddingTop: embedded ? 0 : "0.75rem" }}>
              <SummaryBand>
                This snapshot flags where your spend tickers overlap with (a) community spend sector tickers and/or (b)
                community runners — using the community <b>signal</b> feed (count + signal line).
              </SummaryBand>

              <div style={{ fontSize: UI.FONT_BODY }}>
                <div style={{ marginBottom: "0.6rem" }}>
                  <b>A) Your Spend Tickers ↔ Community Spend Tickers</b>
                  <div style={{ marginTop: "0.25rem" }}>
                    Overlap: <b>{alignSpendVsCommunitySpend.length}</b>{" "}
                    {alignSpendVsCommunitySpend.length ? `(${alignSpendVsCommunitySpend.join(", ")})` : "(—)"}
                  </div>
                </div>

                <div style={{ marginBottom: "0.6rem" }}>
                  <b>B) Your Spend Tickers ↔ Community Runners</b>
                  <div style={{ marginTop: "0.25rem" }}>
                    Overlap: <b>{alignSpendVsCommunityRunners.length}</b>{" "}
                    {alignSpendVsCommunityRunners.length ? `(${alignSpendVsCommunityRunners.join(", ")})` : "(—)"}
                  </div>
                </div>

                <div style={{ marginBottom: "0.2rem" }}>
                  <b>Overlap with Your Personal Runners</b>
                  <div style={{ marginTop: "0.25rem" }}>
                    Overlap (Drip runners ↔ Flow runners): <b>{overlapPersonalVsFlowRunners.length}</b>{" "}
                    {overlapPersonalVsFlowRunners.length ? `(${overlapPersonalVsFlowRunners.join(", ")})` : "(—)"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "0.9rem", overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: UI.FONT_BODY }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>#</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Ticker</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Mapped Sector</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Signal</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Count</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>
                        Sector Leader Proxy
                      </th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {robustFlowRows.map((r) => (
                      <tr key={r.ticker}>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{r.idx}</td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          <b>{r.ticker}</b>
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{r.sectorBucket}</td>

                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          <div>
                            <b>{r.signalRaw}</b>
                          </div>
                          {r.signalParts.length ? (
                            <div style={{ fontSize: UI.FONT_MUTED, marginTop: 4, opacity: 0.9 }}>
                              {r.signalParts.map((p) => (
                                <div key={p}>• {p}</div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: UI.FONT_MUTED, marginTop: 4, opacity: 0.75 }}>
                              No signal line available for this ticker in the community feed.
                            </div>
                          )}
                        </td>

                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          {r.count === null ? "—" : <b>{r.count}</b>}
                        </td>

                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{r.etfSector}</td>

                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          <div>
                            <b>Leader:</b> {r.flags.leader ? "Yes" : "No"}
                          </div>
                          <div>
                            <b>Community spend:</b> {r.flags.communitySpend ? "Yes" : "No"}
                          </div>
                          <div>
                            <b>Runner:</b> {r.flags.runner ? "Yes" : "No"}
                          </div>
                          <div>
                            <b>Trigger:</b> {r.flags.trigger}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: "0.75rem", fontSize: UI.FONT_BODY }}>
                  Signal + count come from the admin community feed. Sector leader proxy comes from ETF 30D leaders
                  (market function). Informational only — not recommendations.
                </div>
              </div>

              <SubHeaderRow
                title="Signals explained (preview)"
                open={openSignalsExplained}
                onToggle={() => setOpenSignalsExplained((v) => !v)}
              />

              {openSignalsExplained ? (
                <div
                  style={{
                    marginTop: "0.6rem",
                    padding: "0.75rem",
                    background: UI.BAND_BG,
                    borderRadius: UI.RADIUS_SOFT,
                    border: `1px solid ${UI.SOFT_BORDER}`,
                    fontSize: UI.FONT_BODY
                  }}
                >
                  <div style={{ marginBottom: "0.5rem" }}>
                    When you see: <b>Signal: High spend concentration · Narrow breadth · Stable</b>, each phrase means:
                  </div>

                  <ul style={{ marginTop: 0 }}>
                    {SIGNAL_EXPLAINER_PREVIEW.map((x) => (
                      <li key={x.title} style={{ marginBottom: "0.35rem" }}>
                        <b>{x.title}</b>: {x.body}
                      </li>
                    ))}
                  </ul>

                  <div style={{ marginTop: "0.75rem" }}>
                    <b>How to read the full Signal line:</b>
                    <div style={{ marginTop: "0.25rem" }}>{SIGNAL_LINE_READER}</div>
                  </div>

                  <div style={{ marginTop: "0.75rem" }}>
                    <b>Additional signal tags you may see in this demo:</b>
                    <ul style={{ marginTop: "0.35rem" }}>
                      {EXTRA_SIGNALS.map((x) => (
                        <li key={x.title} style={{ marginBottom: "0.35rem" }}>
                          <b>{x.title}</b>: {x.body}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
