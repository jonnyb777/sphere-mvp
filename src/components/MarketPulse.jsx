// FILE: src/components/MarketPulse.jsx
import { useEffect, useMemo, useState } from "react";
import TimeframeControls from "./TimeframeControls";
import { Card } from "./ui/UiKit";
import { UI } from "./SectionUI";
import { rollUpSector } from "../utils/sectorRollup";

function pct(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${(Number(n) * 100).toFixed(2)}%`;
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

function formatSpendSectorsWithRollup(rawSectors = []) {
  return (rawSectors || [])
    .filter(Boolean)
    .map((s) => {
      const r = rollUpSector(s);
      return r && r !== s ? `${s} (${r})` : s;
    })
    .join(", ");
}

/**
 * Diversity runner selection:
 * - pick 1 then 2 from each top sector (if possible),
 * - then fill remaining by performance, ignoring caps.
 */
function pickTop10DiversifiedByUserSectors({
  items,
  topSectors,
  getSector,
  getTicker,
  maxTotal = 10,
  maxPerTopSector = 2
}) {
  const arr = Array.isArray(items) ? items : [];
  const sectors = (Array.isArray(topSectors) ? topSectors : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const picked = [];
  const pickedTickers = new Set();
  const countBySector = new Map();

  const bySector = new Map();
  for (const x of arr) {
    const t = String(getTicker(x) || "").toUpperCase().trim();
    if (!t) continue;
    const s = String(getSector(x) || "Other / Unmapped");
    if (!bySector.has(s)) bySector.set(s, []);
    bySector.get(s).push(x);
  }

  for (const [s, list] of bySector.entries()) {
    list.sort((a, b) => {
      const ra = Number(a.return30d ?? -999);
      const rb = Number(b.return30d ?? -999);
      return rb - ra;
    });
  }

  const canAddStrict = (x) => {
    const t = String(getTicker(x) || "").toUpperCase().trim();
    if (!t || pickedTickers.has(t)) return false;

    const s = String(getSector(x) || "Other / Unmapped");
    if (sectors.includes(s)) {
      const n = countBySector.get(s) || 0;
      if (n >= maxPerTopSector) return false;
    }
    return true;
  };

  const canAddLoose = (x) => {
    const t = String(getTicker(x) || "").toUpperCase().trim();
    if (!t || pickedTickers.has(t)) return false;
    return true;
  };

  const add = (x) => {
    const t = String(getTicker(x) || "").toUpperCase().trim();
    const s = String(getSector(x) || "Other / Unmapped");
    picked.push(x);
    pickedTickers.add(t);
    countBySector.set(s, (countBySector.get(s) || 0) + 1);
  };

  for (const s of sectors) {
    if (picked.length >= maxTotal) break;
    const list = bySector.get(s) || [];
    const first = list.find((x) => canAddStrict(x));
    if (first) add(first);
  }

  for (const s of sectors) {
    if (picked.length >= maxTotal) break;
    const list = bySector.get(s) || [];
    const next = list.find((x) => canAddStrict(x));
    if (next) add(next);
  }

  for (const x of arr) {
    if (picked.length >= maxTotal) break;
    if (canAddLoose(x)) add(x);
  }

  return picked.slice(0, maxTotal);
}

function buildPulseNarrative({
  spendSectorsRaw,
  spendSectorsRolled,
  sectorLeaders,
  tickerLeaders,
  timeframeDays,
  asOfDate,
  timeMode
}) {
  const raw = (spendSectorsRaw || []).filter(Boolean);
  const rolled = (spendSectorsRolled || []).filter(Boolean);
  const leaders = Array.isArray(sectorLeaders) ? sectorLeaders : [];
  const runners = Array.isArray(tickerLeaders) ? tickerLeaders : [];

  if (!raw.length) {
    return `Upload transactions to generate your top spend categories. Once we have them, we’ll compute Market Pulse for ${windowLabel({
      timeframeDays,
      asOfDate,
      timeMode
    })}.`;
  }

  const rawLine = formatSpendSectorsWithRollup(raw);
  const rolledLine = uniq(rolled).join(", ");

  const leaderSectors = Array.from(new Set(leaders.map((x) => x.sectorName).filter(Boolean)));
  const coveredLeaders = leaderSectors.slice(0, 5);

  const runnerSectors = Array.from(new Set(runners.map((x) => x.sectorName).filter(Boolean)));
  const coveredRunners = runnerSectors.slice(0, 5);
  const runnerExtra = Math.max(0, runnerSectors.length - coveredRunners.length);

  return `Market Pulse for ${windowLabel({
    timeframeDays,
    asOfDate,
    timeMode
  })}. Your activity drives the runner list: we start from your top spend categories (${rawLine}), roll them up into market buckets (${rolledLine}), then select up to 10 runners by performance from tickers mapped to those buckets (diversified across your buckets when possible). Market “Sector Leaders” above are ETF proxies for context and may differ from your spend. ${
    coveredLeaders.length ? `Market sector leaders include: ${coveredLeaders.join(", ")}.` : ""
  } ${
    coveredRunners.length
      ? `Your runners span: ${coveredRunners.join(", ")}${runnerExtra ? ` (+${runnerExtra} more)` : ""}.`
      : ""
  }`;
}

/**
 * Fetch JSON from Netlify Functions in a way that works:
 * - Live Netlify deploy (relative path works)
 * - Netlify Dev (8888) (relative path works)
 * - Vite dev (5173/5174) where relative path returns index.html (HTML) -> retry 8888
 */
async function fetchJsonNetlifyFunction(pathWithQuery, { requireAuth = false } = {}) {
  const isLocalhost =
    window?.location?.hostname === "localhost" || window?.location?.hostname === "127.0.0.1";
  const port = String(window?.location?.port || "");

  // Build candidate URLs (works for prod + netlify dev + vite dev)
  const tryUrls = [pathWithQuery];
  if (isLocalhost && port !== "8888") {
    tryUrls.push(`http://localhost:8888${pathWithQuery}`);
  }

  // Try to get Firebase ID token (only if logged in)
  let token = null;
  try {
    // IMPORTANT: update this import path based on where this helper lives
    // If this helper is inside MarketPulse.jsx, import { auth } from "../firebase"
    // If it is inside a different folder, adjust the relative path accordingly.
    const { auth } = await import("../firebase");
    const user = auth?.currentUser || null;
    token = user ? await user.getIdToken() : null;
  } catch (e) {
    // no-op: token remains null
  }

  if (requireAuth && !token) {
    throw new Error("Not logged in (no Firebase token available).");
  }

  let lastErr = null;

  for (const url of tryUrls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: token
  ? { Authorization: `Bearer ${token}`, "content-type": "application/json" }
  : { "content-type": "application/json" }
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}\nFirst chars: ${text.slice(0, 180)}`);
      }

      const looksHtml = ct.includes("text/html") || text.trim().toLowerCase().startsWith("<!doctype html");
      if (looksHtml) {
        throw new Error(
          `Non-JSON response for ${url}\nContent-Type: ${ct || "unknown"}\nFirst chars: ${text.slice(0, 180)}`
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
 * Sector ETFs for "Top 5 Sector Leaders" (Market context)
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
  "Consumer Discretionary": ["AMZN", "TGT", "HD", "LOW", "MCD", "SBUX", "CMG", "YUM", "DPZ", "BKNG", "EXPE", "ABNB", "MAR", "HLT"],
  "Consumer Staples": ["WMT", "COST", "KR", "ACI", "PG", "KO", "PEP", "CL", "KMB"],
  Healthcare: ["UNH", "JNJ", "MRK", "PFE", "ABBV", "CVS", "WBA"],
  Industrials: ["CAT", "GE", "HON", "DE", "MMM", "FDX", "UPS", "DAL", "LUV", "UAL"],
  Energy: ["XOM", "CVX", "COP", "SLB", "PSX", "MPC", "VLO"],
  Technology: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AVGO", "CRM", "ADBE", "ORCL"],
  "Communication Services": ["NFLX", "DIS", "WBD", "SPOT", "T", "VZ", "TMUS"],
  Financials: ["JPM", "BAC", "GS", "MS", "C", "PGR", "ALL", "TRV", "CB"],
  Utilities: ["NEE", "DUK", "SO", "EXC", "AEP"],
  Materials: ["LIN", "APD", "SHW", "ECL"],
  "Real Estate": ["AMT", "PLD", "EQIX"],

  "Consumer & Retail": ["AMZN", "TGT", "WMT", "COST", "HD", "LOW"],
  Restaurants: ["MCD", "SBUX", "CMG", "YUM", "DPZ"],
  Transportation: ["UBER", "FDX", "UPS", "DAL", "LUV"],
  "Media & Entertainment": ["NFLX", "DIS", "WBD", "SPOT"],

  Grocery: ["KR", "ACI", "SFM", "WMT", "COST"],
  "Big Box Retail": ["WMT", "COST", "TGT", "BJ"],
  Pharmacies: ["CVS", "WBA"],
  "Gas Stations": ["XOM", "CVX", "MPC", "PSX", "VLO"],
  Insurance: ["PGR", "ALL", "TRV", "CB", "MET"],
  Telecom: ["T", "VZ", "TMUS"],
  Subscriptions: ["NFLX", "SPOT", "DIS", "MSFT", "ADBE", "CRM"],
  Travel: ["BKNG", "EXPE", "ABNB", "MAR", "HLT", "DAL", "UAL", "LUV", "RCL", "CCL"],
  Airlines: ["DAL", "UAL", "AAL", "LUV"],
  "Hotels & Lodging": ["MAR", "HLT", "H"],
  "Online Travel": ["BKNG", "EXPE", "ABNB"],
  "Cruises & Leisure": ["RCL", "CCL", "NCLH"]
};

export default function MarketPulse({
  topSpendSectors,
  transactions,
  onAddTicker,
  onAvailableTickers,
  onPersonalRunnersChange,
  onSectorLeadersChange,

  timeframeDays = 30,
  asOfDate,
  timeMode = "trailing",

  setTimeframeDays,
  setAsOfDate,
  setTimeMode
}) {
  const [sectorLeaders, setSectorLeaders] = useState([]);
  const [tickerLeaders, setTickerLeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataSourceNote, setDataSourceNote] = useState("");
  const [fatalError, setFatalError] = useState("");

  // NEW: non-fatal missing ticker note
  const [missingNote, setMissingNote] = useState("");

  // ✅ Re-add: raw top spend sectors (you were referencing it but it didn't exist)
  const spendSectorsRaw = useMemo(
    () => (topSpendSectors || []).filter(Boolean).slice(0, 5),
    [topSpendSectors]
  );
  
  // ✅ Rolled-up buckets used for mapping into sectorUniverse
  const spendSectorsRolled = useMemo(() => {
    const rolled = spendSectorsRaw.map((s) => rollUpSector(s)).filter(Boolean);
    const cleaned = rolled.filter((s) => s !== "Other / Unmapped");
    return uniq(cleaned.length ? cleaned : rolled);
  }, [spendSectorsRaw]);

  // ✅ Debug logs (single place, after vars exist)
  useEffect(() => {
    console.log("spendSectorsRaw", spendSectorsRaw);
    console.log("spendSectorsRolled", spendSectorsRolled);
  }, [spendSectorsRaw, spendSectorsRolled]);

  const tickerToRolledSector = useMemo(() => {
    const map = {};
    for (const [key, tickers] of Object.entries(sectorUniverse)) {
      const rolledKey = rollUpSector(key);
      for (const t of tickers) map[String(t).toUpperCase()] = rolledKey;
    }
    return map;
  }, []);

  const tickersForSpendSectors = useMemo(() => {
    const tickers = [];

    for (const sector of spendSectorsRolled) {
      tickers.push(...(sectorUniverse[sector] || []));
    }

    if (!tickers.length) {
      for (const raw of spendSectorsRaw) {
        tickers.push(...(sectorUniverse[raw] || []));
      }
    }

    // IMPORTANT: cap to keep requests safe; degrade gracefully with partial results
    return uniq(tickers.map((t) => String(t).toUpperCase())).slice(0, 60);
  }, [spendSectorsRolled, spendSectorsRaw]);

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
      setMissingNote("");

      try {
        // --- Sector leader ETFs (market context) ---
        const etfTickers = sectorEtfs.map((s) => s.ticker).join(",");

        const qs = new URLSearchParams({
          tickers: etfTickers,
          days: String(timeframeDays || 30),
          asOf: asOfDate || "",
          mode: timeMode || "trailing"
        });

        const etfJson = await fetchJsonNetlifyFunction(`/.netlify/functions/market?${qs.toString()}`);

        const etfItemsRaw = Array.isArray(etfJson.items) ? etfJson.items : [];
        const etfMissing = Array.isArray(etfJson.missing) ? etfJson.missing : [];

        // only keep valid numeric returns
        const etfItems = etfItemsRaw
          .map((x) => ({ ...x, return30d: Number(x.return30d) }))
          .filter((x) => Number.isFinite(x.return30d));
        etfItems.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));

        const leaders = etfItems.slice(0, 5).map((x) => ({
          ...x,
          sectorName: sectorEtfs.find((s) => s.ticker === x.ticker)?.name || "Sector"
        }));

        setSectorLeaders(leaders);
        if (typeof onSectorLeadersChange === "function") onSectorLeadersChange(leaders);

        // --- Activity-led runners based on YOUR spend sectors ---
        if (tickersForSpendSectors.length) {
          const uniQs = new URLSearchParams({
            tickers: tickersForSpendSectors.join(","),
            days: String(timeframeDays || 30),
            asOf: asOfDate || "",
            mode: timeMode || "trailing"
          });

          const uniJson = await fetchJsonNetlifyFunction(`/.netlify/functions/market?${uniQs.toString()}`);

          const uniItemsRaw = Array.isArray(uniJson.items) ? uniJson.items : [];
          const uniMissing = Array.isArray(uniJson.missing) ? uniJson.missing : [];

          const uniItems = uniItemsRaw
            .map((x) => ({ ...x, return30d: Number(x.return30d) }))
            .filter((x) => Number.isFinite(x.return30d));
          uniItems.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));

          const labeledSorted = uniItems.map((x) => ({
            ...x,
            sectorName: tickerToRolledSector[String(x.ticker || "").toUpperCase()] || "Other / Unmapped"
          }));

          const top10 = pickTop10DiversifiedByUserSectors({
            items: labeledSorted,
            topSectors: spendSectorsRolled.length ? spendSectorsRolled : spendSectorsRaw.map((s) => rollUpSector(s)),
            getSector: (x) => x.sectorName,
            getTicker: (x) => x.ticker,
            maxTotal: 10,
            maxPerTopSector: 2
          });

          const alphaTop10 = top10.slice().sort((a, b) => {
            const s = String(a.sectorName || "").localeCompare(String(b.sectorName || ""), undefined, {
              sensitivity: "base"
            });
            if (s !== 0) return s;
            return String(a.ticker || "").localeCompare(String(b.ticker || ""), undefined, { sensitivity: "base" });
          });

          setTickerLeaders(alphaTop10);

          if (typeof onPersonalRunnersChange === "function") {
            onPersonalRunnersChange(alphaTop10.map((x) => x.ticker).filter(Boolean));
          }

          // Non-fatal note: missing cache tickers
          const missingCombined = uniq([...(etfMissing || []), ...(uniMissing || [])]).filter(Boolean);
          if (missingCombined.length) {
            setMissingNote(
              `Some tickers are missing cached market data (${missingCombined.length}). Showing partial results.`
            );
          }
        } else {
          setTickerLeaders([]);
          if (typeof onPersonalRunnersChange === "function") onPersonalRunnersChange([]);

          if (etfMissing.length) {
            setMissingNote(`Some sector ETF tickers are missing cached market data (${etfMissing.length}).`);
          }
        }

        setDataSourceNote(
          "Market data is computed from daily close data and served from cache. Informational only; not a recommendation."
        );
      } catch (e) {
        console.error("MarketPulse error:", e);

        // IMPORTANT: degrade gracefully
        // If we already have some data, do not fatal. Otherwise show fatal.
        const haveAnything = (sectorLeaders && sectorLeaders.length) || (tickerLeaders && tickerLeaders.length);

        if (haveAnything) {
          setMissingNote("Market data partially failed to load. Showing whatever was already available.");
        } else {
          setFatalError(e?.message || String(e));
        }

        setDataSourceNote(
          "Market data may occasionally fail/lag. If it fails, it’s usually the function endpoint not returning JSON."
        );
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tickersForSpendSectors,
    tickerToRolledSector,
    spendSectorsRaw,
    spendSectorsRolled,
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
      spendSectorsRaw,
      spendSectorsRolled,
      sectorLeaders,
      tickerLeaders,
      timeframeDays,
      asOfDate: asOfDate || asOfComputed || "",
      timeMode
    });
  }, [spendSectorsRaw, spendSectorsRolled, sectorLeaders, tickerLeaders, timeframeDays, asOfDate, asOfComputed, timeMode]);

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

      {missingNote ? (
        <div
          style={{
            padding: "0.6rem 0.75rem",
            background: "#eef6ff",
            border: "1px solid #cfe8ff",
            marginBottom: "0.75rem",
            borderRadius: UI.RADIUS_SOFT
          }}
        >
          <b>Note:</b> {missingNote}
        </div>
      ) : null}

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
          <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: UI.FONT_BODY }}>{fatalError}</pre>
        </div>
      ) : null}

      <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, marginTop: "0.25rem", color: UI.PRIMARY }}>
        Top 5 Sector Leaders ({timeframeDays}D){" "}
        <span style={{ fontSize: UI.FONT_MUTED, fontWeight: 700, opacity: 0.9 }}>— Market • ETF proxies</span>
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
          — Your activity-led (based on your top spend categories)
        </span>
      </div>

      <p style={{ fontSize: UI.FONT_BODY, marginBottom: "0.25rem" }}>
        Top Spend Categories (Spend): <b>{formatSpendSectorsWithRollup(spendSectorsRaw) || "—"}</b>
      </p>

      <p style={{ fontSize: UI.FONT_BODY, marginTop: 0 }}>
        Market Roll-up Buckets: <b>{(spendSectorsRolled || []).join(", ") || "—"}</b>
      </p>

      {tickerLeaders.length === 0 ? (
        <p style={{ fontSize: UI.FONT_BODY }}>
          No runners shown yet (upload transactions + ensure sector mapping produced at least one recognized sector, and market cache is warmed).
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
              <button key={"add-" + x.ticker} onClick={() => onAddTicker(x.ticker)} style={{ padding: "0.35rem 0.6rem" }}>
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
