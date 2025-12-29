import { useEffect, useMemo, useState } from "react";

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

async function safeFetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Fetch failed (${res.status}) for ${url}\n` +
        `Content-Type: ${ct || "unknown"}\n` +
        `First chars: ${text.slice(0, 120)}`
    );
  }

  if (!ct.includes("application/json") && !ct.includes("text/json")) {
    const text = await res.text();
    throw new Error(
      `Non-JSON response for ${url}\n` +
        `Content-Type: ${ct || "unknown"}\n` +
        `First chars: ${text.slice(0, 120)}`
    );
  }

  return await res.json();
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
  }
];

export default function MonthlyFlow({ userSpendTickers, userRunners }) {
  const [communityItems, setCommunityItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [sectorLeaders, setSectorLeaders] = useState([]);
  const [leadersLoading, setLeadersLoading] = useState(false);

  const [fatalLoadError, setFatalLoadError] = useState("");

  // Load admin-fed community file
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setFatalLoadError("");
      try {
        const json = await safeFetchJson("/community-flow.json");
        const arr = Array.isArray(json) ? json : [];
        setCommunityItems(arr);
      } catch (e) {
        console.error("MonthlyFlow load error:", e);
        setCommunityItems([]);
        setFatalLoadError(e?.message || String(e));
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

  // Community Top Sectors by aggregated "count"
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

  const narrativeHighestSector = useMemo(() => {
    return communityTopSectors[0] || "—";
  }, [communityTopSectors]);

  // Top 10 Community Runners (ensures at least one per top sector if available)
  const top10CommunityRunners = useMemo(() => {
    const topSectorSet = new Set(communityTopSectors);

    const preferred = normalizedCommunity.filter((x) => topSectorSet.has(x.sector));
    const pool = preferred.length ? preferred : normalizedCommunity;

    const sorted = [...pool].sort((a, b) => b.count - a.count);

    const chosen = [];
    const seen = new Set();

    // one per top sector first
    for (const s of communityTopSectors) {
      const pick = sorted.find((x) => x.sector === s && !seen.has(x.ticker));
      if (pick) {
        chosen.push(pick);
        seen.add(pick.ticker);
      }
    }

    // fill remaining
    for (const x of sorted) {
      if (chosen.length >= 10) break;
      if (seen.has(x.ticker)) continue;
      chosen.push(x);
      seen.add(x.ticker);
    }

    return chosen.slice(0, 10);
  }, [normalizedCommunity, communityTopSectors]);

  // Fetch sector leader ETFs (same source as MarketPulse uses)
  useEffect(() => {
    const run = async () => {
      setLeadersLoading(true);
      setFatalLoadError("");
      try {
        const etfTickers = sectorEtfs.map((s) => s.ticker).join(",");
        const json = await safeFetchJson(
          `/.netlify/functions/market?tickers=${encodeURIComponent(etfTickers)}`
        );
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
        setFatalLoadError((prev) => prev || (e?.message || String(e)));
      } finally {
        setLeadersLoading(false);
      }
    };
    run();
  }, []);

  const asOf = useMemo(() => {
    const d = sectorLeaders.map((x) => x.latestDate).filter(Boolean);
    return maxDate(d);
  }, [sectorLeaders]);

  // FLOW ALIGNMENT: user spend tickers vs community tickers
  const alignmentUserSpendVsCommunity = useMemo(() => {
    const userSet = new Set((userSpendTickers || []).map((t) => String(t).toUpperCase().trim()).filter(Boolean));
    if (!userSet.size) return [];

    // Show up to 15 matches; highest count first
    const matches = normalizedCommunity
      .filter((x) => userSet.has(x.ticker))
      .sort((a, b) => b.count - a.count);

    // de-dupe tickers
    const seen = new Set();
    const out = [];
    for (const m of matches) {
      if (seen.has(m.ticker)) continue;
      out.push(m);
      seen.add(m.ticker);
      if (out.length >= 15) break;
    }
    return out;
  }, [userSpendTickers, normalizedCommunity]);

  // FLOW ALIGNMENT: user spend tickers vs community runners
  const alignmentUserSpendVsCommunityRunners = useMemo(() => {
    const userSet = new Set((userSpendTickers || []).map((t) => String(t).toUpperCase().trim()).filter(Boolean));
    if (!userSet.size) return [];
    return top10CommunityRunners.filter((x) => userSet.has(x.ticker));
  }, [userSpendTickers, top10CommunityRunners]);

  // FLOW OVERLAP: personal runners vs community runners
  const overlapPersonalRunners = useMemo(() => {
    const a = new Set((userRunners || []).map((t) => String(t).toUpperCase().trim()).filter(Boolean));
    const b = new Set(top10CommunityRunners.map((x) => x.ticker));
    const out = [];
    for (const t of a) if (b.has(t)) out.push(t);
    return out.sort();
  }, [userRunners, top10CommunityRunners]);

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>Monthly Flow (Paid • Preview)</h3>
      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        Monthly Flow is part of the paid Flow subscription. This preview shows anonymized community-wide aggregate trends — admin fed.
      </p>

      {fatalLoadError ? (
        <div style={{ padding: "0.75rem", background: "#fff3cd", border: "1px solid #ffeeba", marginBottom: "0.75rem" }}>
          <b>Flow feed error:</b>
          <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{fatalLoadError}</pre>
        </div>
      ) : null}

      {/* SECTION 1: Community Spend Summary */}
      <div style={{ padding: "0.75rem", border: "1px solid #ddd", marginTop: "0.5rem" }}>
        <b>Section 1 — Community Spend Summary</b>
        <p style={{ fontSize: "0.95rem", marginBottom: 0 }}>
          This month, the highest concentration of community spending was in <b>{narrativeHighestSector}</b>.
        </p>

        <h4 style={{ marginBottom: "0.25rem" }}>Top Sectors (Community Spend)</h4>
        {loading ? (
          <p style={{ fontSize: "0.9rem" }}>Loading community feed…</p>
        ) : communityTopSectors.length ? (
          <ol>
            {communityTopSectors.map((s) => (
              <li key={s}>
                <b>{s}</b>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ fontSize: "0.9rem" }}>
            No community sectors shown yet (admin aggregate feed not populated).
          </p>
        )}
      </div>

      {/* SECTION 2: Sector Leaders */}
      <div style={{ padding: "0.75rem", border: "1px solid #ddd", marginTop: "0.75rem" }}>
        <b>Section 2 — Market Context (Sector Leaders)</b>

        <h4 style={{ marginTop: "0.5rem" }}>Top 5 Sector Leaders (30D) — ETF Proxies</h4>
        <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
          <b>As of:</b> {asOf || "—"} {leadersLoading ? "(Loading…)" : ""}
        </p>
        {sectorLeaders.length ? (
          <ol>
            {sectorLeaders.map((x) => (
              <li key={x.ticker}>
                <b>{x.sectorName}</b> ({x.ticker}): <b>{pct(x.return30d)}</b>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ fontSize: "0.9rem" }}>No sector leader data yet.</p>
        )}
      </div>

      {/* SECTION 3: Community Runners + Alignment Snapshot (Flow) */}
      <div style={{ padding: "0.75rem", border: "1px solid #ddd", marginTop: "0.75rem" }}>
        <b>Section 3 — Community Runners + Alignment (Flow)</b>

        <h4 style={{ marginTop: "0.5rem" }}>Top 10 Runners (30D) — Based on Community Top Spend Sectors</h4>
        {top10CommunityRunners.length ? (
          <ol>
            {top10CommunityRunners.map((x) => (
              <li key={x.ticker} style={{ marginBottom: "0.35rem" }}>
                <b>{x.sector}</b> — {x.ticker}{" "}
                <span style={{ fontSize: "0.9rem" }}>(Signal: {x.signal})</span>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ fontSize: "0.9rem" }}>
            No community runners shown yet (admin aggregate feed not populated).
          </p>
        )}

        {/* Alignment Snapshot (Flow) — TWO alignments + overlap */}
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#f6f6f6" }}>
          <b>Alignment Snapshot (Flow)</b>
          <div style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
            This is a paid Flow preview: how your mapped spend/runners align with community signals — informational only.
          </div>

          <h4 style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
            A) Your Spend Tickers ↔ Community Signals
          </h4>
          {alignmentUserSpendVsCommunity.length ? (
            <ol>
              {alignmentUserSpendVsCommunity.map((x) => (
                <li key={`sig-${x.ticker}`} style={{ marginBottom: "0.35rem" }}>
                  <b>{x.sector}</b> — {x.ticker}{" "}
                  <span style={{ fontSize: "0.9rem" }}>(Signal: {x.signal})</span>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ fontSize: "0.9rem" }}>
              No alignment yet (needs your uploaded transactions + merchant→ticker mapping to produce spend tickers).
            </p>
          )}

          <h4 style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
            B) Your Spend Tickers ↔ Community Runners
          </h4>
          {alignmentUserSpendVsCommunityRunners.length ? (
            <ol>
              {alignmentUserSpendVsCommunityRunners.map((x) => (
                <li key={`run-${x.ticker}`} style={{ marginBottom: "0.35rem" }}>
                  <b>{x.sector}</b> — {x.ticker}{" "}
                  <span style={{ fontSize: "0.9rem" }}>(Signal: {x.signal})</span>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ fontSize: "0.9rem" }}>
              No runner alignment yet (needs your spend tickers + populated community runners).
            </p>
          )}

          <h4 style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
            C) Overlap: Your Personal Runners ↔ Community Runners
          </h4>
          {overlapPersonalRunners.length ? (
            <p style={{ fontSize: "0.95rem", marginTop: 0 }}>
              Overlapping tickers: <b>{overlapPersonalRunners.join(", ")}</b>
            </p>
          ) : (
            <p style={{ fontSize: "0.9rem" }}>
              No overlap yet (needs personal runners from Market Pulse + community runners).
            </p>
          )}
        </div>

        {/* Signals explained */}
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#f6f6f6" }}>
          <b>Signals explained (preview):</b>
          <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
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
        </div>
      </div>
    </div>
  );
}
