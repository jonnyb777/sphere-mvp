// FILE: src/components/MarketPulse.jsx
import { useEffect, useMemo, useState } from "react";
import TimeframeControls from "./TimeframeControls";
import { Card } from "./ui/UiKit";
import { UI } from "./SectionUI";
import { pickTop10WithTwoPerSector } from "../utils/pickTop10WithTwoPerSector";

function pct(n) {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function maxDate(dates) {
  const parsed = dates
    .map((d) => new Date(d))
    .filter((x) => !Number.isNaN(x.getTime()));
  if (!parsed.length) return null;
  parsed.sort((a, b) => b.getTime() - a.getTime());
  return parsed[0].toISOString().slice(0, 10);
}

function windowLabel({ timeframeDays, asOfDate, timeMode }) {
  const mode = timeMode === "monthEnd" ? "Month-end" : "Trailing";
  const asOf = asOfDate || "latest available";
  return `${timeframeDays}d · ${mode} · as-of ${asOf}`;
}

function buildPulseNarrative({ spendSectors, tickerLeaders, timeframeDays, asOfDate, timeMode }) {
  const sectors = (spendSectors || []).filter(Boolean);
  const leaders = Array.isArray(tickerLeaders) ? tickerLeaders : [];

  if (!sectors.length) {
    return `Upload transactions to generate your top spend sectors. Once we have them, we’ll show sector leaders + runners for ${windowLabel({
      timeframeDays,
      asOfDate,
      timeMode
    })}.`;
  }

  if (!leaders.length) {
    return `We found your top spend sectors (${sectors.join(
      ", "
    )}), but we don’t have runner data yet for ${windowLabel({ timeframeDays, asOfDate, timeMode })}.`;
  }

  const leaderSectors = Array.from(new Set(leaders.map((x) => x.sectorName).filter(Boolean)));
  const covered = leaderSectors.slice(0, 5);
  const extraCount = Math.max(0, leaderSectors.length - covered.length);

  return `This Market Pulse is computed on ${windowLabel({
    timeframeDays,
    asOfDate,
    timeMode
  })}. We start from your top spend sectors (${sectors.join(
    ", "
  )}) and then select up to 10 “runners” by performance from the tickers mapped to those sectors. Where possible, we prioritize representation across your top sectors (up to 2 per sector), then fill remaining slots with the strongest performers. ${
    covered.length
      ? `Current runners span: ${covered.join(", ")}${extraCount ? ` (+${extraCount} more)` : ""}.`
      : ""
  }`;
}

/**
 * Fetch JSON from Netlify Functions in a way that works:
 * - Live Netlify deploy (relative path works)
 * - Netlify Dev (8888) (relative path works)
 * - Vite dev (5173/5174) where relative path returns index.html (HTML) -> retry 8888
 */
async function fetchJsonNetlifyFunction(pathWithQuery) {
  const isLocalhost =
    window?.location?.hostname === "localhost" || window?.location?.hostname === "127.0.0.1";
  const port = String(window?.location?.port || "");

  const tryUrls = [];
  tryUrls.push(pathWithQuery);

  if (isLocalhost && port !== "8888") {
    tryUrls.push(`http://localhost:8888${pathWithQuery}`);
  }

  let lastErr = null;

  for (const url of tryUrls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}\nFirst chars: ${text.slice(0, 120)}`);
      }

      const looksHtml =
        ct.includes("text/html") || text.trim().toLowerCase().startsWith("<!doctype html");

      if (looksHtml) {
        throw new Error(
          `Non-JSON response for ${url}\nContent-Type: ${ct || "unknown"}\nFirst chars: ${text.slice(0, 120)}`
        );
      }

      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Failed to fetch JSON from function");
}

/**
 * Sector ETFs for "Top 5 Sector Leaders"
 */
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

const sectorUniverse = {
  "Consumer & Retail": ["AMZN", "TGT", "WMT", "COST", "HD", "LOW"],
  Healthcare: ["UNH", "JNJ", "MRK", "PFE", "ABBV", "CVS"],
  Restaurants: ["MCD", "SBUX", "CMG", "YUM", "DPZ"],
  Transportation: ["UBER", "FDX", "UPS", "DAL", "LUV"],
  Energy: ["XOM", "CVX", "COP", "SLB", "PSX"],
  Technology: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AVGO"],
  "Media & Entertainment": ["NFLX", "DIS", "WBD", "SPOT"],
  Financials: ["JPM", "BAC", "GS", "MS", "C"],
  Industrials: ["CAT", "GE", "HON", "DE", "MMM"]
};

export default function MarketPulse({
  topSpendSectors,
  transactions, // kept in signature for stability
  onAddTicker,
  onAvailableTickers,
  onPersonalRunnersChange,
  onSectorLeadersChange,

  // values
  timeframeDays = 30,
  asOfDate,
  timeMode = "trailing",

  // setters (optional; when provided, we render the nice in-panel controls)
  setTimeframeDays,
  setAsOfDate,
  setTimeMode
}) {
  const [sectorLeaders, setSectorLeaders] = useState([]);
  const [tickerLeaders, setTickerLeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataSourceNote, setDataSourceNote] = useState("");
  const [fatalError, setFatalError] = useState("");

  const spendSectors = useMemo(
    () => (topSpendSectors || []).filter(Boolean).slice(0, 5),
    [topSpendSectors]
  );

  const tickerToSector = useMemo(() => {
    const map = {};
    for (const [sectorName, tickers] of Object.entries(sectorUniverse)) {
      for (const t of tickers) map[t] = sectorName;
    }
    return map;
  }, []);

  const tickersForSpendSectors = useMemo(() => {
    const tickers = [];
    for (const sector of spendSectors) {
      tickers.push(...(sectorUniverse[sector] || []));
    }
    return uniq(tickers);
  }, [spendSectors]);

  useEffect(() => {
    if (typeof onAvailableTickers === "function") {
      onAvailableTickers(tickersForSpendSectors);
    }
  }, [tickersForSpendSectors, onAvailableTickers]);

  const asOfComputed = useMemo(() => {
    const d1 = sectorLeaders.map((x) => x.latestDate).filter(Boolean);
    const d2 = tickerLeaders.map((x) => x.latestDate).filter(Boolean);
    return maxDate([...d1, ...d2]);
  }, [sectorLeaders, tickerLeaders]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setFatalError("");

      try {
        const etfTickers = sectorEtfs.map((s) => s.ticker).join(",");

        const qs = new URLSearchParams({
          tickers: etfTickers,
          days: String(timeframeDays || 30),
          asOf: asOfDate || "",
          mode: timeMode || "trailing"
        });

        const etfJson = await fetchJsonNetlifyFunction(`/.netlify/functions/market?${qs.toString()}`);

        const etfItems = Array.isArray(etfJson.items) ? etfJson.items : [];
        etfItems.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));

        const leaders = etfItems.slice(0, 5).map((x) => ({
          ...x,
          sectorName: sectorEtfs.find((s) => s.ticker === x.ticker)?.name || "Sector"
        }));

        setSectorLeaders(leaders);
        if (typeof onSectorLeadersChange === "function") onSectorLeadersChange(leaders);

        if (tickersForSpendSectors.length) {
          const uniQs = new URLSearchParams({
            tickers: tickersForSpendSectors.join(","),
            days: String(timeframeDays || 30),
            asOf: asOfDate || "",
            mode: timeMode || "trailing"
          });

          const uniJson = await fetchJsonNetlifyFunction(`/.netlify/functions/market?${uniQs.toString()}`);

          const uniItems = Array.isArray(uniJson.items) ? uniJson.items : [];
          uniItems.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));

          const labeledSorted = uniItems.map((x) => ({
            ...x,
            sectorName: tickerToSector[x.ticker] || "Other / Unmapped"
          }));

          const top10 = pickTop10WithTwoPerSector({
            items: labeledSorted,
            topSectors: spendSectors,
            getSector: (x) => x.sectorName,
            getTicker: (x) => x.ticker,
            maxTotal: 10,
            maxPerTopSector: 2
          });

          setTickerLeaders(top10);

          if (typeof onPersonalRunnersChange === "function") {
            onPersonalRunnersChange(top10.map((x) => x.ticker).filter(Boolean));
          }
        } else {
          setTickerLeaders([]);
          if (typeof onPersonalRunnersChange === "function") onPersonalRunnersChange([]);
        }

        setDataSourceNote(
          "Returns are computed from free daily close data via a Netlify Function. Informational only; not a recommendation."
        );
      } catch (e) {
        console.error("MarketPulse error:", e);
        setFatalError(e?.message || String(e));
        setDataSourceNote(
          "Market data may occasionally fail/lag. If it fails, it’s usually the function endpoint not returning JSON."
        );
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [
    tickersForSpendSectors,
    tickerToSector,
    spendSectors,
    timeframeDays,
    asOfDate,
    timeMode,
    onPersonalRunnersChange,
    onSectorLeadersChange
  ]);

  const showControls =
    typeof setTimeframeDays === "function" &&
    typeof setAsOfDate === "function" &&
    typeof setTimeMode === "function";

  const pulseNarrative = useMemo(() => {
    return buildPulseNarrative({
      spendSectors,
      tickerLeaders,
      timeframeDays,
      asOfDate: asOfDate || asOfComputed || "",
      timeMode
    });
  }, [spendSectors, tickerLeaders, timeframeDays, asOfDate, asOfComputed, timeMode]);

  return (
    <div style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY, lineHeight: 1.45 }}>
      {showControls ? (
        <div style={{ marginBottom: "0.75rem" }}>
          <Card>
            <TimeframeControls
              timeframeDays={timeframeDays}
              setTimeframeDays={setTimeframeDays}
              asOfDate={asOfDate}
              setAsOfDate={setAsOfDate}
              mode={timeMode}
              setMode={setTimeMode}
            />
          </Card>
        </div>
      ) : null}

      {/* ✅ Removed the standalone As-of line between controls and narrative */}

      <div style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
        <div
          style={{
            padding: "0.75rem",
            background: UI.BAND_BG,
            borderRadius: UI.RADIUS_SOFT,
            border: `1px solid ${UI.SOFT_BORDER}`
          }}
        >
          <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, color: UI.PRIMARY }}>Market Pulse Narrative</div>
          <div style={{ marginTop: "0.35rem" }}>{pulseNarrative}</div>
        </div>
      </div>

      {fatalError ? (
        <div
          style={{
            padding: "0.75rem",
            background: "#fff3cd",
            border: "1px solid #ffeeba",
            marginBottom: "0.75rem",
            borderRadius: UI.RADIUS_SOFT
          }}
        >
          <b>Market Pulse error:</b>
          <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: UI.FONT_BODY }}>
            {fatalError}
          </pre>
        </div>
      ) : null}

      <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, marginTop: "0.25rem", color: UI.PRIMARY }}>
        Top 5 Sector Leaders ({timeframeDays}D){" "}
        <span style={{ fontSize: UI.FONT_MUTED, fontWeight: 700, opacity: 0.9 }}>— ETF proxies</span>
        {loading ? <span style={{ fontSize: UI.FONT_MUTED, fontWeight: 700 }}> (Loading…)</span> : null}
      </div>

      {sectorLeaders.length === 0 ? (
        <p style={{ fontSize: UI.FONT_BODY }}>No sector leader data yet.</p>
      ) : (
        <ol style={{ fontSize: UI.FONT_BODY }}>
          {sectorLeaders.map((x) => (
            <li key={x.ticker}>
              <b>{x.sectorName}</b> ({x.ticker}): <b>{pct(x.return30d)}</b>
            </li>
          ))}
        </ol>
      )}

      <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, marginTop: "1rem", color: UI.PRIMARY }}>
        Top 10 Runners ({timeframeDays}D){" "}
        <span style={{ fontSize: UI.FONT_MUTED, fontWeight: 700, opacity: 0.9 }}>
          — based on your top spend sectors
        </span>
      </div>

      <p style={{ fontSize: UI.FONT_BODY }}>
        Top Spend Sectors (Spend): <b>{spendSectors.join(", ") || "—"}</b>
      </p>

      {tickerLeaders.length === 0 ? (
        <p style={{ fontSize: UI.FONT_BODY }}>
          No runners shown yet (upload transactions + ensure sector mapping produced at least one recognized sector).
        </p>
      ) : (
        <ol style={{ fontSize: UI.FONT_BODY }}>
          {tickerLeaders.map((x) => (
            <li key={x.ticker} style={{ marginBottom: "0.35rem" }}>
              <b>{x.sectorName}</b> — {x.ticker}: <b>{pct(x.return30d)}</b>
            </li>
          ))}
        </ol>
      )}

      {typeof onAddTicker === "function" && tickerLeaders.length ? (
        <div
          style={{
            marginTop: "0.9rem",
            padding: "0.75rem",
            background: UI.BAND_BG,
            borderRadius: UI.RADIUS_SOFT,
            border: `1px solid ${UI.SOFT_BORDER}`
          }}
        >
          <b>Add a runner to Paper Portfolio</b>
          <div style={{ fontSize: UI.FONT_BODY, marginTop: "0.25rem" }}>
            Select a runner to add (you’ll be prompted for the simulated amount).
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
            {tickerLeaders.map((x) => (
              <button
                key={"add-" + x.ticker}
                onClick={() => onAddTicker(x.ticker)}
                style={{ padding: "0.35rem 0.6rem" }}
              >
                Add {x.ticker}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: "0.75rem",
          padding: "0.75rem",
          background: UI.BAND_BG,
          borderRadius: UI.RADIUS_SOFT,
          border: `1px solid ${UI.SOFT_BORDER}`
        }}
      >
        <b>Confidence note:</b>
        <div style={{ fontSize: UI.FONT_BODY, marginTop: "0.25rem" }}>{dataSourceNote}</div>
      </div>
    </div>
  );
}
