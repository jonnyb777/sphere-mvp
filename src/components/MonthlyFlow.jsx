import { useEffect, useMemo, useState } from "react";

function pct(n) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function toDateOnly(s) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function uniqUpper(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const t = String(x || "").toUpperCase().trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function uniqExact(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const t = String(x || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Monthly Flow (Paid • Preview)
 * - Uses admin-controlled community aggregate data from:
 *   /.netlify/functions/community
 * - In MVP, it can be deterministic mock data.
 * - In production, generated on a schedule from anonymized aggregates.
 * - Informational only; not recommendations.
 */
export default function MonthlyFlow({ dripTickers, dripSectors }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    fetch("/.netlify/functions/community")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j || j.ok !== true || !j.data) {
          setError("Community data unavailable.");
          setPayload(null);
          return;
        }
        setPayload(j.data);
        setError("");
      })
      .catch(() => {
        if (!alive) return;
        setError("Community data unavailable.");
        setPayload(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  const asOf = useMemo(() => {
    if (!payload?.asOf) return "—";
    return toDateOnly(payload.asOf) || "—";
  }, [payload]);

  const topSectors = useMemo(() => {
    return Array.isArray(payload?.topSectors) ? payload.topSectors : [];
  }, [payload]);

  const communityRunners = useMemo(() => {
    return Array.isArray(payload?.communityRunners) ? payload.communityRunners : [];
  }, [payload]);

  const top10Community = useMemo(() => communityRunners.slice(0, 10), [communityRunners]);

  const dripTickerSet = useMemo(() => new Set(uniqUpper(dripTickers || [])), [dripTickers]);
  const dripSectorList = useMemo(() => uniqExact(dripSectors || []), [dripSectors]);
  const dripSectorSet = useMemo(
    () => new Set(dripSectorList.map((s) => s.toLowerCase())),
    [dripSectorList]
  );

  const communityTopSectorNames = useMemo(() => {
    return topSectors.slice(0, 5).map((x) => String(x?.sector || "").trim()).filter(Boolean);
  }, [topSectors]);

  const communitySectorSet = useMemo(
    () => new Set(communityTopSectorNames.map((s) => s.toLowerCase())),
    [communityTopSectorNames]
  );

  // Sector overlap: Drip top spend sectors vs Community top sectors
  const sectorOverlap = useMemo(() => {
    if (!dripSectorSet.size || !communitySectorSet.size) return [];
    const overlap = [];
    for (const s of dripSectorList) {
      if (communitySectorSet.has(s.toLowerCase())) overlap.push(s);
    }
    return overlap;
  }, [dripSectorSet, communitySectorSet, dripSectorList]);

  // Ticker overlap: Drip-side tickers (universe) vs Community top 10
  const tickerOverlap = useMemo(() => {
    if (!dripTickerSet.size) return [];
    const out = [];
    for (const r of top10Community) {
      const t = String(r?.ticker || "").toUpperCase().trim();
      if (!t) continue;
      if (dripTickerSet.has(t)) out.push(r);
    }
    return out;
  }, [dripTickerSet, top10Community]);

  // Signal phrase explainer for:
  // "High spend concentration · Narrow breadth · Stable"
  const signalExplainer = useMemo(() => {
    return [
      {
        key: "High spend concentration",
        meaning:
          "A larger share of total community spend is clustering in that sector compared to other sectors (aggregate-only)."
      },
      {
        key: "Moderate concentration",
        meaning:
          "Community spend clusters in that sector, but not overwhelmingly versus others (aggregate-only)."
      },
      {
        key: "Broad-based",
        meaning:
          "Spend is spread across multiple sectors rather than clustering strongly into one (aggregate-only)."
      },
      {
        key: "High breadth",
        meaning:
          "Many distinct merchants/brands contribute to the sector’s signal (more diversified community behavior)."
      },
      {
        key: "Medium breadth",
        meaning:
          "A moderate number of merchants/brands contribute to the sector’s signal."
      },
      {
        key: "Narrow breadth",
        meaning:
          "Fewer merchants/brands contribute to the signal (more concentrated community behavior)."
      },
      {
        key: "Stable",
        meaning:
          "The aggregate signal is persistent across recent periods (less noisy)."
      },
      {
        key: "Emerging",
        meaning:
          "The signal appears to be strengthening recently (developing trend)."
      },
      {
        key: "Spiky",
        meaning:
          "The signal is more volatile or event-driven (more noisy)."
      },
      {
        key: "How to read the full Signal line",
        meaning:
          "Signals are a 3-part label: (1) concentration = how clustered spend is, (2) breadth = how many distinct merchants contribute, (3) stability = how persistent the signal is over time. Example: “High spend concentration · Narrow breadth · Stable” means community spend is clustered into that sector, driven by fewer merchants, and the pattern has persisted across recent periods."
      }
    ];
  }, []);

  const confidenceNote = useMemo(() => {
    return (
      "Monthly Flow is a paid preview powered by anonymized aggregate data. " +
      "Signals are heuristics (spend concentration, breadth, stability) and 30D return proxies where shown. " +
      "Data may lag or differ from broker feeds. Informational only — not a recommendation."
    );
  }, []);

  if (error) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <h3>Monthly Flow (Paid • Preview)</h3>
        <p style={{ fontSize: "0.9rem" }}>
          Monthly Flow is part of the paid Drip+Flow subscription. This preview shows anonymized aggregate trends — informational only.
        </p>
        <p style={{ fontSize: "0.9rem" }}>{error}</p>
      </div>
    );
  }

  if (!payload) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>Monthly Flow (Paid • Preview)</h3>
      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        Monthly Flow is part of the paid Drip+Flow subscription. This preview shows anonymized aggregate trends — informational only.
      </p>

      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        <b>As of:</b> {asOf}
      </p>

      <p style={{ marginTop: 0 }}>
        This month, the highest concentration of community spending was in{" "}
        <b>{payload.narrativeHighestSector || "—"}</b>.
      </p>

      <h4 style={{ marginBottom: "0.25rem" }}>Top Sectors (Spend)</h4>
      {topSectors.length === 0 ? (
        <p style={{ fontSize: "0.9rem" }}>No community sector data available yet.</p>
      ) : (
        <ol style={{ marginTop: "0.25rem" }}>
          {topSectors.slice(0, 5).map((x, idx) => (
            <li key={`${x.sector}-${idx}`}>
              <b>{x.sector || "—"}</b>
              {typeof x.weight === "number" ? `: ${pct(x.weight)}` : ""}
            </li>
          ))}
        </ol>
      )}

      <h4 style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
        Top 10 Runners (30D) — Based on Community Top Spend Sectors
      </h4>

      {top10Community.length === 0 ? (
        <p style={{ fontSize: "0.9rem" }}>
          No community runners shown yet (admin aggregate feed not populated).
        </p>
      ) : (
        <ol style={{ marginTop: "0.25rem" }}>
          {top10Community.map((x, idx) => (
            <li key={`${x.ticker}-${idx}`} style={{ marginBottom: "0.35rem" }}>
              <b>{x.sector || "—"}</b> — {String(x.ticker || "—").toUpperCase()}
              {typeof x.return30d === "number" ? `: ${pct(x.return30d)}` : ""}
              {x.signal ? ` · Signal: ${x.signal}` : ""}
            </li>
          ))}
        </ol>
      )}

      <h4 style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
        Alignment Snapshot (Personal vs Community)
      </h4>

      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        This summarizes overlap between your mapped spend sectors (Monthly Drip) and community aggregate trends (Monthly Flow), plus overlap between drip-side tickers and community runners.
      </p>

      <div style={{ padding: "0.75rem", background: "#f6f6f6" }}>
        <div style={{ fontSize: "0.95rem" }}>
          <b>Sector overlap</b>
        </div>
        {!dripSectorList.length ? (
          <p style={{ fontSize: "0.9rem" }}>
            No sector overlap available yet (upload transactions so Monthly Drip can map sectors).
          </p>
        ) : sectorOverlap.length === 0 ? (
          <p style={{ fontSize: "0.9rem" }}>
            No overlap between your top spend sectors and the community’s top sectors this period.
          </p>
        ) : (
          <p style={{ fontSize: "0.9rem" }}>
            Shared sectors: <b>{sectorOverlap.join(", ")}</b>
          </p>
        )}

        <div style={{ fontSize: "0.95rem", marginTop: "0.6rem" }}>
          <b>Ticker overlap</b>
        </div>
        {!dripTickers || uniqUpper(dripTickers).length === 0 ? (
          <p style={{ fontSize: "0.9rem" }}>
            No ticker overlap available yet (drip-side ticker universe not loaded).
          </p>
        ) : tickerOverlap.length === 0 ? (
          <p style={{ fontSize: "0.9rem" }}>
            No overlap in the current top community runners.
          </p>
        ) : (
          <ol style={{ marginTop: "0.25rem" }}>
            {tickerOverlap.map((x, idx) => (
              <li key={`${x.ticker}-overlap-${idx}`} style={{ marginBottom: "0.35rem" }}>
                <b>{x.sector || "—"}</b> — {String(x.ticker || "—").toUpperCase()}
                {typeof x.return30d === "number" ? `: ${pct(x.return30d)}` : ""}
                {x.signal ? ` · Signal: ${x.signal}` : ""}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#f6f6f6" }}>
        <b>Signals explained (preview):</b>
        <p style={{ fontSize: "0.9rem", marginTop: "0.4rem" }}>
          When you see: <b>Signal: High spend concentration · Narrow breadth · Stable</b>, each phrase means:
        </p>
        <ul style={{ marginTop: "0.5rem" }}>
          {signalExplainer.map((s) => (
            <li key={s.key} style={{ marginBottom: "0.25rem" }}>
              <b>{s.key}:</b> {s.meaning}
            </li>
          ))}
        </ul>
        <div style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>
          <b>Confidence note:</b> {confidenceNote}
        </div>
      </div>
    </div>
  );
}
