import { useEffect, useMemo, useState } from "react";

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

export default function MarketPulse({ topSpendSectors }) {
  const [sectorLeaders, setSectorLeaders] = useState([]);
  const [tickerLeaders, setTickerLeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataSourceNote, setDataSourceNote] = useState("");

  const spendSectors = useMemo(
    () => (topSpendSectors || []).slice(0, 5),
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

  const asOf = useMemo(() => {
    const d1 = sectorLeaders.map((x) => x.latestDate).filter(Boolean);
    const d2 = tickerLeaders.map((x) => x.latestDate).filter(Boolean);
    return maxDate([...d1, ...d2]);
  }, [sectorLeaders, tickerLeaders]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const etfTickers = sectorEtfs.map((s) => s.ticker).join(",");
        const etfRes = await fetch(
          `/.netlify/functions/market?tickers=${encodeURIComponent(etfTickers)}`
        );
        const etfJson = await etfRes.json();
        const etfItems = Array.isArray(etfJson.items) ? etfJson.items : [];
        etfItems.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));

        const withNames = etfItems.slice(0, 5).map((x) => ({
          ...x,
          sectorName:
            sectorEtfs.find((s) => s.ticker === x.ticker)?.name || "Sector"
        }));
        setSectorLeaders(withNames);

        if (tickersForSpendSectors.length) {
          const uniRes = await fetch(
            `/.netlify/functions/market?tickers=${encodeURIComponent(
              tickersForSpendSectors.join(",")
            )}`
          );
          const uniJson = await uniRes.json();
          const uniItems = Array.isArray(uniJson.items) ? uniJson.items : [];
          uniItems.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999));

          const labeled = uniItems.slice(0, 10).map((x) => ({
            ...x,
            sectorName: tickerToSector[x.ticker] || "Other / Unmapped"
          }));
          setTickerLeaders(labeled);
        } else {
          setTickerLeaders([]);
        }

        setDataSourceNote(
          "Returns are computed from free daily close data (Stooq) via a Netlify Function, using the most recent available trading day and the closest close at ~30 calendar days prior. Data may be delayed, adjusted differently than broker feeds, and can be affected by corporate actions. This section is informational only and is not a recommendation."
        );
      } catch (e) {
        console.error("MarketPulse error:", e);
        setSectorLeaders([]);
        setTickerLeaders([]);
        setDataSourceNote(
          "Market data is fetched from a free daily price source and may occasionally fail, lag, or differ from broker/official feeds. Treat results as informational only."
        );
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [tickersForSpendSectors, tickerToSector]);

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>Market Pulse (Trailing 30 Days)</h3>
      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        <b>As of:</b> {asOf || "—"} {loading ? "(Loading…)" : ""} — calculated
        from free daily price data.
      </p>

      <h4>Top 5 Sector Leaders (30D) — ETF Proxies</h4>
      {sectorLeaders.length === 0 ? (
        <p style={{ fontSize: "0.9rem" }}>No sector leader data yet.</p>
      ) : (
        <ol>
          {sectorLeaders.map((x) => (
            <li key={x.ticker}>
              <b>{x.sectorName}</b> ({x.ticker}): <b>{pct(x.return30d)}</b>
            </li>
          ))}
        </ol>
      )}

      <h4>Top 10 Movers (30D) — Based on Your Top Spend Sectors</h4>
      <p style={{ fontSize: "0.9rem" }}>
        Your top spend sectors: <b>{spendSectors.join(", ") || "—"}</b>
      </p>

      {tickerLeaders.length === 0 ? (
        <p style={{ fontSize: "0.9rem" }}>
          No movers shown yet (upload transactions + map merchants to sectors).
        </p>
      ) : (
        <ol>
          {tickerLeaders.map((x) => (
            <li key={x.ticker}>
              <b>{x.sectorName}</b> — {x.ticker}: <b>{pct(x.return30d)}</b>
            </li>
          ))}
        </ol>
      )}

      <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#f6f6f6" }}>
        <b>Confidence note:</b>
        <div style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
          {dataSourceNote}
        </div>
      </div>
    </div>
  );
}
