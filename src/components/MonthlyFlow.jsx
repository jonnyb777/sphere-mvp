// FILE: src/components/MonthlyFlow.jsx
import { useEffect, useMemo, useState } from "react";
import TimeframeControls from "./TimeframeControls";
import { Card } from "./ui/UiKit";
import { UI, SectionBand, SummaryBand, SubHeaderRow, usePersistedBool, Badge, MiniStat } from "./SectionUI";
import { rollUpSector, toEtfSectorName } from "../utils/sectorRollup";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { markFirstFlowView } from "../utils/userStats";

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

function endOfMonth(dateISO) {
  const dt = new Date(dateISO);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 23, 59, 59, 999);
}

function withinWindow(itemDate, timeframeDays, asOfISO, timeMode) {
  if (!itemDate) return true;
  const iso = asOfISO || new Date().toISOString().slice(0, 10);
  const asOf = new Date(iso);
  if (Number.isNaN(asOf.getTime())) return true;

  const end = timeMode === "monthEnd" ? endOfMonth(iso) : new Date(iso);
  if (!end) return true;

  const start = new Date(end);
  start.setDate(start.getDate() - Number(timeframeDays || 30));

  const dt = new Date(itemDate);
  if (Number.isNaN(dt.getTime())) return true;
  return dt >= start && dt <= end;
}

async function fetchJsonNetlifyFunction(pathWithQuery, opts = {}) {
  const isLocalhost =
    window?.location?.hostname === "localhost" || window?.location?.hostname === "127.0.0.1";
  const port = String(window?.location?.port || "");

  const tryUrls = [pathWithQuery];
  if (isLocalhost && port !== "8888") {
    tryUrls.push(`http://localhost:8888${pathWithQuery}`);
  }

  let lastErr = null;

  for (const url of tryUrls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: opts.headers || undefined
      });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}\nFirst chars: ${text.slice(0, 120)}`);
      }

      const looksHtml = ct.includes("text/html") || text.trim().toLowerCase().startsWith("<!doctype html");
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
 * Supports:
 *  A) ARRAY of { ticker, sector, signal, count, date, eligibility?, ... }
 *  B) Legacy object: { asOf, topSectors, signals:[{ticker, sector}, ...] }
 */
function normalizeCommunityPayload(payload) {
  if (Array.isArray(payload)) return payload;

  if (payload && typeof payload === "object" && Array.isArray(payload.signals)) {
    const asOf = payload.asOf || payload.AsOf || payload.date || payload.Date || null;

    return payload.signals
      .map((x) => ({
        ticker: String(x.ticker || "").toUpperCase().trim(),
        sector: String(x.sector || "Other / Unmapped"),
        signal: String(x.signal || "—"),
        count: Number(x.count ?? 1),
        date: asOf,
        users: 0,
        events: 0,
        maxUserShare: 0,
        top3Share: 0,
        deltaPct: 0,
        eligibility: null
      }))
      .filter((x) => x.ticker);
  }

  return [];
}

function VerifiedBadge({ item }) {
  const elig = item?.eligibility;
  if (!elig) return null;

  const passed = elig.passed === true;
  if (passed) return <Badge tone="neutral">Verified</Badge>;

  return <Badge tone="neutral">Limited</Badge>;
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

function splitSignalLine(signal) {
  const s = String(signal || "").trim();
  if (!s || s === "—") return { raw: "—", parts: [] };
  const parts = s
    .split("·")
    .map((x) => x.trim())
    .filter(Boolean);
  return { raw: s, parts };
}

function scoreTone(score) {
  if (score >= 70) return { tone: "good", label: "High match" };
  if (score >= 40) return { tone: "info", label: "Medium match" };
  return { tone: "neutral", label: "Low match" };
}

function windowLabel({ timeframeDays, asOfDate, timeMode }) {
  const mode = timeMode === "monthEnd" ? "Month-end" : "Trailing";
  const asOf = asOfDate || "latest available";
  return `${timeframeDays}d · ${mode} · as-of ${asOf}`;
}

function buildFlowPulseNarrative({ communityTopSectors, timeframeDays, asOfDate, timeMode }) {
  const sectors = (communityTopSectors || []).filter(Boolean).slice(0, 5);
  if (!sectors.length) {
    return `Load the admin community feed to generate Flow’s pulse. Once we have it, we’ll show leaders + runners for ${windowLabel({
      timeframeDays,
      asOfDate,
      timeMode
    })}.`;
  }

  return `Flow Pulse for ${windowLabel({
    timeframeDays,
    asOfDate,
    timeMode
  })}. We start from the community’s top spend buckets (${sectors.join(
    ", "
  )}), show the strongest ETF sector proxies, and list the most active community runners within those buckets (aggregate-only).`;
}

export default function MonthlyFlow({
  userSpendTickers,
  userRunners,
  onCommunityTopSectorsChange,
  onCommunityRunnersChange,
  onCommunityMerchantsChange,
  section = "all",
  timeframeDays = 30,
  asOfDate,
  timeMode = "trailing",

  setTimeframeDays,
  setAsOfDate,
  setTimeMode,
  userUid,
  flowConsent,
  flowAccess
}) {
  const embedded = section !== "all";

  const [communityItems, setCommunityItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [flowError, setFlowError] = useState("");

  const [sectorLeaders, setSectorLeaders] = useState([]);
  const [leadersLoading, setLeadersLoading] = useState(false);

  const [openMonthly, setOpenMonthly] = usePersistedBool("sphere:flow:open:monthly", true);
  const [openPulse, setOpenPulse] = usePersistedBool("sphere:flow:open:pulse", true);
  const [openAlign, setOpenAlign] = usePersistedBool("sphere:flow:open:alignment", true);
  const [openTrustPanel, setOpenTrustPanel] = usePersistedBool("sphere:flow:open:trustPanel", false);

  const [consent, setConsent] = useState(!!flowConsent);
  const hasAccess = !!flowAccess;

  // ✅ NEW: mark first Flow view (unlock milestone)
  useEffect(() => {
    const uid = String(userUid || "").trim();
    if (uid) markFirstFlowView(uid);
  }, [userUid]);

useEffect(() => {
  setConsent(!!flowConsent);
}, [flowConsent]);

async function saveConsent(nextValue) {
  const uid = String(userUid || "").trim();
  if (!uid) throw new Error("Missing uid for Flow consent.");

  await setDoc(
    doc(db, "users", uid),
    { flowConsent: !!nextValue, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

  const [openMonthlyMerchants, setOpenMonthlyMerchants] = usePersistedBool("sphere:flow:open:monthly:merchants", false);
  const [openMonthlySectors, setOpenMonthlySectors] = usePersistedBool("sphere:flow:open:monthly:sectors", false);
  const [openSignalsExplained, setOpenSignalsExplained] = usePersistedBool("sphere:flow:open:signalsExplained", false);

  const showMonthly = section === "all" || section === "monthly";
  const showPulse = section === "all" || section === "pulse";
  const showAlign = section === "all" || section === "alignment";

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setFlowError("");

      try {
        let json = null;

        try {
          const qs = new URLSearchParams({
            days: String(timeframeDays || 30),
            asOf: asOfDate || "",
            mode: timeMode || "trailing"
          });

          json = await fetchJsonNetlifyFunction(
  `/.netlify/functions/community-flow?${qs.toString()}`,
  { requireAuth: true }
);
        } catch (e) {
          console.warn("MonthlyFlow: community-flow function failed; falling back to static file", e);
          const res = await fetch("/community-flow.json", { cache: "no-store" });
          const text = await res.text();
          json = JSON.parse(text);
        }

        const arr = normalizeCommunityPayload(json);
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
  }, [timeframeDays, asOfDate, timeMode]);

  // ✅ Normalize + roll up sectors so Flow is consistent with MarketPulse and Alignment
  const normalizedCommunity = useMemo(() => {
    const base = (Array.isArray(communityItems) ? communityItems : [])
      .map((x) => ({
        ticker: String(x.ticker || "").toUpperCase().trim(),
        sector: rollUpSector(x.sector || "Other / Unmapped"),
        signal: String(x.signal || "—"),
        count: Number(x.count ?? 0),
        date: x.date || x.Date || x.asOf || x.AsOf || null,

        users: Number(x.users ?? 0),
        events: Number(x.events ?? 0),
        maxUserShare: Number(x.maxUserShare ?? 0),
        top3Share: Number(x.top3Share ?? 0),
        deltaPct: Number(x.deltaPct ?? 0),
        eligibility: x.eligibility || null
      }))
      .filter((x) => x.ticker && x.sector && Number.isFinite(x.count))
      .filter((x) => (x.eligibility ? x.eligibility.passed === true : true));

    const hasAnyDates = base.some((x) => {
      if (!x.date) return false;
      const dt = new Date(x.date);
      return !Number.isNaN(dt.getTime());
    });

    return hasAnyDates ? base.filter((x) => withinWindow(x.date, timeframeDays, asOfDate, timeMode)) : base;
  }, [communityItems, timeframeDays, asOfDate, timeMode]);

  const communityByTicker = useMemo(() => {
    const map = new Map();
    for (const x of normalizedCommunity) {
      const prev = map.get(x.ticker);
      if (!prev || (Number.isFinite(x.count) && x.count > prev.count)) map.set(x.ticker, x);
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
    return Array.from(map.entries())
      .map(([sector, score]) => ({ sector, score }))
      .sort((a, b) => b.score - a.score)
      .filter((x) => x.sector && x.sector !== "Other / Unmapped")
      .slice(0, 5)
      .map((x) => x.sector);
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
    return chosen.sort((a, b) => {
      const s = String(a.sector || "").localeCompare(String(b.sector || ""), undefined, { sensitivity: "base" });
      if (s !== 0) return s;
      return String(a.ticker || "").localeCompare(String(b.ticker || ""), undefined, { sensitivity: "base" });
    });
  }, [normalizedCommunity]);

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

    // ✅ Requirement: runners sorted alphabetically by sector then ticker
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

  useEffect(() => {
  if (typeof onCommunityMerchantsChange === "function") onCommunityMerchantsChange(top10CommunityMerchants);
}, [top10CommunityMerchants, onCommunityMerchantsChange]);

  useEffect(() => {
    const run = async () => {
      setLeadersLoading(true);
      try {
        const etfTickers = sectorEtfs.map((s) => s.ticker).join(",");

        const qs = new URLSearchParams({
          tickers: etfTickers,
          days: String(timeframeDays || 30),
          asOf: asOfDate || "",
          mode: timeMode || "trailing"
        });

        const json = await fetchJsonNetlifyFunction(`/.netlify/functions/market?${qs.toString()}`);
        const itemsRaw = Array.isArray(json.items) ? json.items : [];
        const items = itemsRaw
          .map((x) => ({ ...x, return30d: Number(x.return30d) }))
          .filter((x) => Number.isFinite(x.return30d));

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
  }, [timeframeDays, asOfDate, timeMode]);

  const asOf = useMemo(() => maxDate(sectorLeaders.map((x) => x.latestDate).filter(Boolean)), [sectorLeaders]);

  // --- Alignment inputs ---
  const userSpend = useMemo(() => {
    return (Array.isArray(userSpendTickers) ? userSpendTickers : [])
      .map((x) => String(x || "").toUpperCase().trim())
      .filter(Boolean);
  }, [userSpendTickers]);

  const userRunnersTickers = useMemo(() => {
    return (Array.isArray(userRunners) ? userRunners : []).map((x) => String(x || "").toUpperCase().trim()).filter(Boolean);
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

  const alignSpendVsCommunitySpend = useMemo(() => intersect(userSpend, communitySpendTickers), [userSpend, communitySpendTickers]);
  const alignSpendVsCommunityRunners = useMemo(() => intersect(userSpend, communityRunnerTickers), [userSpend, communityRunnerTickers]);
  const overlapPersonalVsFlowRunners = useMemo(() => intersect(userRunnersTickers, communityRunnerTickers), [userRunnersTickers, communityRunnerTickers]);

  const leaderNames = useMemo(() => {
    return new Set(
      (Array.isArray(sectorLeaders) ? sectorLeaders : [])
        .map((x) => String(x?.sectorName || "").trim())
        .filter(Boolean)
    );
  }, [sectorLeaders]);

  const robustFlowRows = useMemo(() => {
  const spendSet = new Set(communitySpendTickers);
  const runnerSet = new Set(communityRunnerTickers);

  // let more through, then filter down to “flagged only”
  const tickers = [...userSpend].slice(0, 80);

  const rows = tickers.map((tkr) => {
    const meta = communityByTicker.get(tkr) || null;
    const sectorBucket = meta?.sector || "—"; // already rolled-up
    const etfSector = toEtfSectorName(sectorBucket);
    const isLeader = !!etfSector && leaderNames.has(etfSector);

    const isCommunitySpend = spendSet.has(tkr);
    const isRunner = runnerSet.has(tkr);

    const sig = splitSignalLine(meta?.signal);
    const count = Number.isFinite(meta?.count) ? meta.count : null;

    let trigger = "No signal overlap.";
    if (isRunner && isCommunitySpend) trigger = "Runner + Community spend overlap.";
    else if (isRunner) trigger = "Runner overlap.";
    else if (isCommunitySpend) trigger = "Community spend overlap.";

    const hasAnyFlag = isLeader || isCommunitySpend || isRunner;

    return {
      ticker: tkr,
      sectorBucket,
      signalRaw: sig.raw,
      signalParts: sig.parts,
      count,
      etfSector: etfSector || "—",
      flags: { leader: isLeader, communitySpend: isCommunitySpend, runner: isRunner, trigger, hasAnyFlag }
    };
  });

  // ✅ only show tickers that actually overlap / have flags
  const filtered = rows.filter((r) => r.flags.hasAnyFlag);

  // stable ordering (sector then ticker)
  filtered.sort((a, b) => {
    const s = String(a.sectorBucket || "").localeCompare(String(b.sectorBucket || ""), undefined, { sensitivity: "base" });
    if (s !== 0) return s;
    return String(a.ticker || "").localeCompare(String(b.ticker || ""), undefined, { sensitivity: "base" });
  });

  // add # after filtering
  return filtered.slice(0, 40).map((r, idx) => ({ ...r, idx: idx + 1 }));
}, [userSpend, communityByTicker, communitySpendTickers, communityRunnerTickers, leaderNames]);

  const allowMonthlyBody = embedded ? true : openMonthly;
  const allowPulseBody = embedded ? true : openPulse;
  const allowAlignBody = embedded ? true : openAlign;

  const alignmentScore = useMemo(() => {
    const a = alignSpendVsCommunitySpend.length;
    const b = alignSpendVsCommunityRunners.length;
    const c = overlapPersonalVsFlowRunners.length;

    const aMax = Math.max(1, Math.min(userSpend.length || 1, 10));
    const bMax = Math.max(1, Math.min(userSpend.length || 1, 10));
    const cMax = Math.max(1, Math.min(userRunnersTickers.length || 1, 10));

    const s1 = Math.min(1, a / aMax);
    const s2 = Math.min(1, b / bMax);
    const s3 = Math.min(1, c / cMax);

    return Math.round((0.4 * s1 + 0.4 * s2 + 0.2 * s3) * 100);
  }, [alignSpendVsCommunitySpend.length, alignSpendVsCommunityRunners.length, overlapPersonalVsFlowRunners.length, userSpend.length, userRunnersTickers.length]);

  const scoreMeta = useMemo(() => scoreTone(alignmentScore), [alignmentScore]);

  const showPulseControls =
    typeof setTimeframeDays === "function" && typeof setAsOfDate === "function" && typeof setTimeMode === "function";

  const pulseNarrative = useMemo(() => {
    return buildFlowPulseNarrative({
      communityTopSectors,
      timeframeDays,
      asOfDate: asOfDate || asOf || "",
      timeMode
    });
  }, [communityTopSectors, timeframeDays, asOfDate, asOf, timeMode]);

  return (
    <div style={{ lineHeight: 1.45 }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <b>Flow feed error</b>
            <Badge tone="bad">Blocked</Badge>
          </div>
          <div style={{ marginTop: "0.25rem", fontSize: UI.FONT_BODY, whiteSpace: "pre-wrap" }}>{flowError}</div>
        </div>
      ) : null}

      <SubHeaderRow
        title="How Flow works (privacy + credibility)"
        open={openTrustPanel}
        onToggle={() => setOpenTrustPanel((v) => !v)}
      />

      {openTrustPanel ? (
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
            <b>Flow is aggregate-only.</b> Your individual transactions are never shown in community views.
          </div>

          <ul style={{ marginTop: 0, marginBottom: 0, paddingLeft: "1.1rem" }}>
            <li>
              <b>Verified</b> = the bucket met minimum privacy + quality thresholds (enough contributors, not dominated by a few users).
            </li>
            <li>
              <b>Limited</b> = the bucket exists, but didn’t meet thresholds yet.
            </li>
            <li>
              <b>No badge</b> = demo/static feed or missing credibility metadata.
            </li>
          </ul>

          <div style={{ marginTop: "0.6rem", fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
            <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `1px solid ${UI.SOFT_BORDER}` }}>
  <div style={{ fontWeight: 900, marginBottom: 6 }}>Contribution controls</div>
</div>
           <div style={{ marginTop: "0.75rem" }}>
  <label style={{ cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}>
    <input
      type="checkbox"
      checked={consent}
      onChange={async (e) => {
        const v = e.target.checked;
        setConsent(v);

        try {
          await saveConsent(v);
        } catch (err) {
          console.error("saveConsent error:", err);
          setConsent((prev) => !prev);
          alert("Could not save Flow consent. Please try again.");
        }
      }}
    />
    <span>
      Allow my anonymized data to contribute to Flow
    </span>
  </label>
</div>
{!hasAccess ? (
    <div style={{ marginTop: 8, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
      Upgrade to Flow to participate in community aggregation.
    </div>
  ) : null}
            Informational only — Flow highlights patterns, not advice.
          </div>
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
                Monthly Flow is part of the paid Flow subscription. This preview shows anonymized community-wide aggregate trends — admin fed.
              </p>

              <SummaryBand>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <b>Community insight:</b> This month, the highest concentration of community activity was in <b>{narrativeHighestSector}</b>.
                  </div>
                  <Badge tone="info">Community</Badge>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <MiniStat label="Top sectors shown" value={communityTopSectors.length || "—"} />
                  <MiniStat label="Merchants shown" value={top10CommunityMerchants.length || "—"} />
                  <MiniStat label="Runners shown" value={top10CommunityRunners.length || "—"} />
                </div>
              </SummaryBand>

              <SubHeaderRow
                title="Top 10 Merchants (Community)"
                open={openMonthlyMerchants}
                onToggle={() => setOpenMonthlyMerchants((v) => !v)}
              />

              {!top10CommunityMerchants.length ? (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
                  {loading ? "Loading community feed…" : "No community merchant data yet (feed not populated)."}
                </p>
              ) : openMonthlyMerchants ? (
                <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
                  {top10CommunityMerchants.map((x) => (
                    <li key={x.ticker} style={{ marginBottom: "0.35rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <b>{x.sector}</b> — <b>{x.ticker}</b> <VerifiedBadge item={x} />
                        <span style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>(Signal: {x.signal})</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}

              <SubHeaderRow
                title="Top Sectors (Community)"
                open={openMonthlySectors}
                onToggle={() => setOpenMonthlySectors((v) => !v)}
              />

              {loading ? (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>Loading community feed…</p>
              ) : !communityTopSectors.length ? (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
                  No community sectors shown yet (feed not populated).
                </p>
              ) : openMonthlySectors ? (
                <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
                  {[...communityTopSectors]
                    .slice()
                    .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }))
                    .map((s) => (
                      <li key={s} style={{ marginBottom: "0.35rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <b>{s}</b>
                        </div>
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
            <SectionBand title={`Flow Pulse (${timeframeDays} Days)`} open={openPulse} onToggle={() => setOpenPulse((v) => !v)} />
          ) : null}

          {allowPulseBody ? (
            <div style={{ paddingTop: embedded ? 0 : "0.75rem" }}>
              {showPulseControls ? (
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
                  <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, color: UI.PRIMARY }}>Flow Pulse Narrative</div>
                  <div style={{ marginTop: "0.35rem", fontSize: UI.FONT_BODY }}>{pulseNarrative}</div>
                </div>
              </div>

              <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, marginTop: "0.25rem", color: UI.PRIMARY }}>
                Top 5 Sector Leaders ({timeframeDays}D){" "}
                <span style={{ fontSize: UI.FONT_MUTED, fontWeight: 700, opacity: 0.9 }}>— ETF proxies</span>
              </div>

              {leadersLoading ? (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>Loading sector leaders…</p>
              ) : sectorLeaders.length ? (
                <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
                  {sectorLeaders
                    .slice()
                    .sort((a, b) =>
                      String(a.sectorName || "").localeCompare(String(b.sectorName || ""), undefined, { sensitivity: "base" })
                    )
                    .map((x) => (
                      <li key={x.ticker} style={{ marginBottom: "0.35rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <b>{x.sectorName}</b> <span style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>({x.ticker})</span>
                          <span style={{ fontWeight: 900 }}>{pct(x.return30d)}</span>
                        </div>
                      </li>
                    ))}
                </ol>
              ) : (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>No sector leader data yet.</p>
              )}

              <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, marginTop: "1rem", color: UI.PRIMARY }}>
                Top 10 Runners ({timeframeDays}D){" "}
                <span style={{ fontSize: UI.FONT_MUTED, fontWeight: 700, opacity: 0.9 }}>
                  — based on community top sectors
                </span>
              </div>

              {top10CommunityRunners.length ? (
                <ol style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
                  {top10CommunityRunners.map((x) => (
                    <li key={x.ticker} style={{ marginBottom: "0.35rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <b>{x.sector}</b> — <b>{x.ticker}</b> <VerifiedBadge item={x} />
                        <span style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>(Signal: {x.signal})</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ fontSize: UI.FONT_BODY, marginTop: "0.5rem" }}>
                  {loading ? "Loading community feed…" : "No community runners shown yet (feed not populated)."}
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <b>Alignment score:</b> <b>{alignmentScore}</b>/100{" "}
                    <span style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>(based on overlap counts)</span>
                  </div>
                  <Badge tone={scoreMeta.tone}>{scoreMeta.label}</Badge>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <MiniStat label="Spend↔Community spend" value={alignSpendVsCommunitySpend.length} />
                  <MiniStat label="Spend↔Community runners" value={alignSpendVsCommunityRunners.length} />
                  <MiniStat label="Your runners↔Flow runners" value={overlapPersonalVsFlowRunners.length} />
                </div>
              </SummaryBand>

{robustFlowRows.length === 0 ? (
  <div
    style={{
      marginTop: "0.75rem",
      padding: "0.75rem",
      background: UI.BAND_BG,
      borderRadius: UI.RADIUS_SOFT,
      border: `1px solid ${UI.SOFT_BORDER}`,
      fontSize: UI.FONT_BODY
    }}
  >
    <b>No overlap yet.</b>
    <div style={{ marginTop: 6, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
      None of your current spend tickers match Flow’s flagged community spend/runners (or leader proxies) for this window.
      Try a different timeframe, upload more recent data, or wait for the community window to populate.
    </div>
  </div>
) : null}

              <div style={{ marginTop: "0.9rem", overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: UI.FONT_BODY }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>#</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Ticker</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Mapped Sector</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Signal</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Count</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Sector Leader Proxy</th>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <b>{r.signalRaw}</b>
                            {r.flags.runner ? <Badge tone="info">Runner</Badge> : null}
                            {r.flags.communitySpend ? <Badge tone="neutral">Community spend</Badge> : null}
                            {r.flags.leader ? <Badge tone="good">Leader proxy</Badge> : null}
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

                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span>{r.etfSector}</span>
                            {r.flags.leader ? <Badge tone="good">Top 5 leader</Badge> : <Badge tone="neutral">—</Badge>}
                          </div>
                        </td>

                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {r.flags.leader ? <Badge tone="good">Leader</Badge> : <Badge tone="neutral">Not leader</Badge>}
                              {r.flags.communitySpend ? <Badge tone="neutral">Community spend</Badge> : <Badge tone="neutral">No spend</Badge>}
                              {r.flags.runner ? <Badge tone="info">Runner</Badge> : <Badge tone="neutral">Not runner</Badge>}
                            </div>
                            <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
                              <b>Trigger:</b> {r.flags.trigger}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: "0.75rem", fontSize: UI.FONT_BODY }}>
                  Signal + count come from the admin community feed. Sector leader proxy comes from ETF leaders (market function).
                  Informational only — not recommendations.
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
                    Signals are a 3-part label: (1) concentration, (2) breadth, (3) stability.
                  </div>
                  <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
                    Example: “High spend concentration · Narrow breadth · Stable” means community activity is clustered into that sector, driven by fewer names, and persistent across recent periods.
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
