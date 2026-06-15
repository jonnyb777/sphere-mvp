// FILE: src/components/DashboardSnapshot.jsx
import { useMemo } from "react";
import { UI, SummaryBand } from "./SectionUI";
import { Card } from "./ui/UiKit";
import { classifyMerchant } from "../utils/merchantSectorMap";
import InsightCard from "./InsightCard";
import AlignmentReportCard from "./AlignmentReportCard";
import FlowMarketAlignmentCard from "./FlowMarketAlignmentCard";
import FlowAlignmentScoreCard from "./FlowAlignmentScoreCard";
import TrendTimingCard from "./TrendTimingCard";
import FlowConfidenceCard from "./FlowConfidenceCard";
import {
  buildPrimaryInsightCard,
  buildDashboardFlags,
  buildDripIdentity,
buildFlowIdentity,
getExploreThemes
} from "../utils/insightEngine";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0.00";
  return `$${v.toFixed(2)}`;
}

function getMerchant(tx) {
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

  const explicitDebit = details.includes("debit") || dirType.includes("debit") || creditDebit.includes("debit");

  if (explicitCredit && !explicitDebit) return null;
  if (amount < 0) return Math.abs(amount);
  if (explicitDebit) return amount;

  return explicitCredit ? null : amount;
}

function cleanSpendCategory(category) {
  const c = String(category || "").trim();
  if (!c || c === "Other / Unmapped") return null;
  if (c === "Consumer & Retail") return "E-Commerce / Retail";
  return c;
}

function normalizeThemeName(x = "") {
  const s = String(x || "").toLowerCase().trim();

  if (/digital|technology|subscription|telecom|software|cloud|semiconductor/.test(s)) return "digital";
  if (/restaurant|dining|food away/.test(s)) return "restaurants";
  if (/travel|transportation|mobility|airline|hotel/.test(s)) return "travel";
  if (/health|fitness|pharm|medical/.test(s)) return "health";
  if (/retail|apparel|consumer|e-commerce|big box/.test(s)) return "retail";
  if (/grocery|staples|utilities|insurance|defensive|essentials/.test(s)) return "essentials";
  if (/financial|bank|credit|payment/.test(s)) return "financial";

  return s;
}

function getSnapshotDateValue(snapshot) {
  const raw =
    snapshot?.behavioralAsOf ||
    snapshot?.lastUploadedAt ||
    snapshot?.updatedAt ||
    snapshot?.createdAt;

  if (!raw) return 0;

  const d = raw?.toDate
    ? raw.toDate()
    : new Date(raw);

  const t = d.getTime();

  return Number.isFinite(t) ? t : 0;
}

function getSnapshotTopTheme(snapshot) {
  const move = Array.isArray(snapshot?.alignmentReport?.moves)
    ? snapshot.alignmentReport.moves[0]
    : null;

  if (move?.label || move?.sector) {
    return normalizeThemeName(
      move.label || move.sector
    );
  }

  const topSector = Array.isArray(snapshot?.topSectors)
    ? snapshot.topSectors[0]
    : null;

  return normalizeThemeName(
    topSector?.sector || ""
  );
}

function categoryTotalsFromTransactions(transactions) {
  const map = new Map();

  for (const tx of Array.isArray(transactions) ? transactions : []) {
    const merchant = getMerchant(tx);
    const spend = getSpend(tx);
    if (!merchant || spend === null || spend <= 0) continue;

    const rawCategory = classifyMerchant(merchant)?.sector || "Other / Unmapped";
    const spendCategory = cleanSpendCategory(rawCategory);
    if (!spendCategory) continue;

    map.set(spendCategory, (map.get(spendCategory) || 0) + spend);
  }

  const total = Array.from(map.values()).reduce((sum, n) => sum + n, 0);
  if (!total) return [];

  const rows = Array.from(map.entries())
  .map(([category, amount]) => ({
    category,
    amount,
    pct: (amount / total) * 100
  }))
  .sort((a, b) => b.amount - a.amount);

let running = 0;

return rows.map((row, idx) => {
  const pctRounded =
    idx === rows.length - 1
      ? Math.max(0, 100 - running)
      : Number(row.pct.toFixed(1));

  running += pctRounded;

  return { ...row, pctRounded };
});
}

function merchantTotalsFromTransactions(transactions) {
  const map = new Map();

  for (const tx of Array.isArray(transactions) ? transactions : []) {
    const merchant = getMerchant(tx);
    const spend = getSpend(tx);

    if (!merchant || spend === null || spend <= 0) continue;
    map.set(merchant, (map.get(merchant) || 0) + spend);
  }

  return Array.from(map.entries())
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function buildDashboardInsight({ categoryRows, merchantRows, totalSpend, transactionCount }) {
  const topCategory = categoryRows[0];
  const topMerchant = merchantRows[0];

  if (!transactionCount) return "Upload transactions to see your dashboard insight.";

  if (!topCategory) {
    return "We found uploaded rows, but not enough mapped spend categories yet. Add merchant names or use the CSV template for a cleaner snapshot.";
  }

  return `Your largest spend category is ${topCategory.category}, representing ${topCategory.pctRounded.toFixed(
    1
  )}% of mapped spending. Your top merchant is ${topMerchant?.merchant || "not available"}, with total uploaded spend of ${money(
    totalSpend
  )}.`;
}

function PieChart({ rows }) {
  if (!rows.length) {
    return (
      <div style={{ fontSize: UI.FONT_BODY, opacity: 0.85 }}>
        Upload transactions to populate the spend category chart.
      </div>
    );
  }

  let offset = 0;

  const stops = rows.map((r, idx) => {
    const start = offset;
    const end = offset + r.pctRounded;
    offset = end;

    const color = `hsl(${(idx * 47 + 205) % 360} 65% 48%)`;
    return `${color} ${start}% ${end}%`;
  });

  const background = `conic-gradient(${stops.join(", ")})`;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 18, alignItems: "center" }}>
      <div
        aria-label="Spend category pie chart"
        style={{
          width: 170,
          height: 170,
          borderRadius: "50%",
          background,
          border: `1px solid ${UI.SOFT_BORDER}`,
          boxShadow: "0 8px 20px rgba(0,0,0,0.08)"
        }}
      />

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r, idx) => {
          const color = `hsl(${(idx * 47 + 205) % 360} 65% 48%)`;

          return (
            <div
              key={r.category}
              style={{
                display: "grid",
                gridTemplateColumns: "14px 1fr auto",
                gap: 8,
                alignItems: "center",
                fontSize: UI.FONT_BODY
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 999, background: color }} />
              <span>{r.category}</span>
              <b>{r.pctRounded.toFixed(1)}%</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardSnapshot({
  transactions,
  latestSnapshot = null,
  snapshotHistory = [],
  hasFlowAccess = false,
  communityTopSectors = []
}) {
  const arr = useMemo(() => (Array.isArray(transactions) ? transactions : []), [transactions]);

  const categoryRows = useMemo(() => {
  if (arr.length) return categoryTotalsFromTransactions(arr);

  const snapshotSectors = Array.isArray(latestSnapshot?.topSectors)
    ? latestSnapshot.topSectors
    : [];

  const total = snapshotSectors.reduce((sum, s) => sum + Number(s.amount || 0), 0);

  if (!total) return [];

  let running = 0;

  return snapshotSectors.map((s, idx) => {
    const pct = total ? (Number(s.amount || 0) / total) * 100 : 0;

    const pctRounded =
      idx === snapshotSectors.length - 1
        ? Math.max(0, 100 - running)
        : Number(pct.toFixed(1));

    running += pctRounded;

    return {
      category: s.sector,
      amount: Number(s.amount || 0),
      pct,
      pctRounded
    };
  });
}, [arr, latestSnapshot]);
  const merchantRows = useMemo(() => {
  if (arr.length) return merchantTotalsFromTransactions(arr);

  return Array.isArray(latestSnapshot?.topMerchants)
    ? latestSnapshot.topMerchants
    : [];
}, [arr, latestSnapshot]);
  const topMerchant = merchantRows[0];

  const totalSpend = useMemo(() => {
  if (!arr.length && latestSnapshot?.totalSpend) {
    return Number(latestSnapshot.totalSpend || 0);
  }

  return arr.reduce((sum, tx) => {
      const spend = getSpend(tx);
      return spend !== null && spend > 0 ? sum + spend : sum;
    }, 0);
  }, [arr]);

  const topCategory = categoryRows[0];

  const dashboardInsight = useMemo(
    () =>
      buildDashboardInsight({
        categoryRows,
        merchantRows,
        totalSpend,
        transactionCount: arr.length
      }),
    [categoryRows, merchantRows, totalSpend, arr.length]
  );

  const dripIdentity = useMemo(
  () => buildDripIdentity({ categoryRows }),
  [categoryRows]
);

const flowIdentity = useMemo(
  () =>
    buildFlowIdentity({
      communityTopSectors:
        hasFlowAccess && communityTopSectors.length
          ? communityTopSectors
          : hasFlowAccess
          ? ["Technology", "Consumer Discretionary", "Consumer Staples"]
          : []
    }),
  [communityTopSectors, hasFlowAccess]
);

const previousIdentity = useMemo(() => {
  if (latestSnapshot?.priorDripIdentity?.label) {
    return latestSnapshot.priorDripIdentity;
  }

  const prior = Array.isArray(latestSnapshot?.priorTopSectors)
    ? latestSnapshot.priorTopSectors
    : [];

  if (!prior.length) return null;

  return buildDripIdentity({
    categoryRows: prior.map((s) => ({
      category: s.sector,
      amount: Number(s.amount || 0),
      pct: Number(s.pct || 0),
      pctRounded: Number(s.pctRounded || s.pct || 0)
    }))
  });
}, [latestSnapshot]);

const dripEvolution = useMemo(() => {
  if (latestSnapshot?.evolution?.text) {
    return latestSnapshot.evolution;
  }

  if (!previousIdentity) {
    return {
      text: `Current identity: ${dripIdentity.emoji} ${dripIdentity.label}. Evolution will appear after your next upload.`
    };
  }

  if (previousIdentity.label === dripIdentity.label) {
    return {
      text: `Still ${dripIdentity.emoji} ${dripIdentity.label}: your pattern remained consistent with your previous upload.`
    };
  }

  return {
    text: `Previously ${previousIdentity.emoji} ${previousIdentity.label} → now ${dripIdentity.emoji} ${dripIdentity.label}.`
  };
}, [latestSnapshot, previousIdentity, dripIdentity]);

  const primaryInsightCard = useMemo(
  () =>
    buildPrimaryInsightCard({
  categoryRows,
  merchantRows,
  totalSpend,
  transactionCount: arr.length,
  money
}),
  [categoryRows, merchantRows, totalSpend, arr.length]
);

const flowExploreCard = useMemo(() => {
  const topCommunitySector = String(communityTopSectors?.[0] || "").trim();

  if (!hasFlowAccess || !topCommunitySector) return null;

  return {
    title: "Community activity is forming a market theme",
    narrative: `Flow activity is currently clustering around ${topCommunitySector.toLowerCase()}, giving you a community-level view of where spending behavior is concentrating.`,
    comparison:
      "This is not a buy signal. It gives beginners a clearer starting point for exploring market themes connected to real consumer behavior.",
    explore: getExploreThemes(topCommunitySector),
    tone: "positive"
  };
}, [hasFlowAccess, communityTopSectors]);

  const dashboardFlags = useMemo(
    () =>
      buildDashboardFlags({
        categoryRows,
        merchantRows,
        totalSpend,
        transactionCount: arr.length
      }),
    [categoryRows, merchantRows, totalSpend, arr.length]
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <SummaryBand>
        <div style={{ fontSize: UI.FONT_BODY }}>
          <b>Dashboard snapshot:</b>{" "}
          {arr.length ? (
            <>
              We found <b>{arr.length}</b> uploaded rows and mapped your populated spend categories below.
            </>
          ) : (
            <>Upload transactions to generate your Sphere snapshot.</>
          )}
        </div>

        <div style={{ marginTop: 6, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>{dashboardInsight}</div>
      </SummaryBand>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12
        }}
      >
        <Card>
          <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.8 }}>Total spend</div>
          <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900, color: UI.PRIMARY }}>{money(totalSpend)}</div>
        </Card>

        <Card>
          <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.8 }}>Transactions</div>
          <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900, color: UI.PRIMARY }}>{arr.length}</div>
        </Card>

        <Card>
          <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.8 }}>Top spend category</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900, color: UI.PRIMARY }}>
            {topCategory?.category || "—"}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.8 }}>Top merchant</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900, color: UI.PRIMARY }}>
            {topMerchant?.merchant || "—"}
          </div>
        </Card>
      </div>

      <Card title="Dashboard flags" subtitle="Patterns from your uploaded spending.">
        <div style={{ display: "grid", gap: 10 }}>
          {dashboardFlags.map((flag) => (
            <div
              key={flag.title}
              style={{
                padding: "0.75rem",
                background: UI.BAND_BG,
                borderRadius: UI.RADIUS_SOFT,
                border: `1px solid ${UI.SOFT_BORDER}`
              }}
            >
              <div style={{ fontWeight: 900, color: UI.PRIMARY }}>{flag.title}</div>
              <div style={{ marginTop: 4, fontSize: UI.FONT_BODY }}>{flag.body}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Spend category mix"
        subtitle="Only populated spend categories are included. Percentages total 100%."
      >
        <PieChart rows={categoryRows} />
      </Card>
<Card>
  <div style={{ display: "grid", gap: 8 }}>
    <div
      style={{
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: UI.FONT_MUTED,
        fontWeight: 900
      }}
    >
      Drip Identity
    </div>

    <div style={{ fontSize: 28, fontWeight: 900, color: UI.PRIMARY }}>
      {dripIdentity.emoji} {dripIdentity.label}
    </div>

    <div style={{ fontSize: UI.FONT_BODY, fontWeight: 900 }}>
      {dripIdentity.traditional}
    </div>

    <div style={{ fontSize: UI.FONT_BODY, opacity: 0.9 }}>
      {dripIdentity.meaning}
    </div>

{hasFlowAccess && !communityTopSectors.length ? (
  <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.85 }}>
    Preview shown until more community Flow data is available.
  </div>
) : null}

    {dripEvolution ? (
      <div
        style={{
          marginTop: 8,
          padding: "0.65rem",
          borderRadius: UI.RADIUS_SOFT,
          background: UI.BAND_BG,
          border: `1px solid ${UI.SOFT_BORDER}`,
          fontSize: UI.FONT_BODY
        }}
      >
        <b>Evolution:</b> {dripEvolution.text}
      </div>
    ) : null}
  </div>
</Card>

{latestSnapshot?.alignmentReport ? (
  <AlignmentReportCard
    report={latestSnapshot.alignmentReport}
    hasFlowAccess={hasFlowAccess}
  />
) : null}

<InsightCard
  title={primaryInsightCard.title}
  narrative={primaryInsightCard.narrative}
  comparison={primaryInsightCard.comparison}
  explore={primaryInsightCard.explore}
  tone={primaryInsightCard.tone}
  identity={dripIdentity}
  evolution={dripEvolution}
/>

{latestSnapshot?.alignmentReport ? (
  <FlowAlignmentScoreCard
    report={latestSnapshot.alignmentReport}
    communityTopSectors={communityTopSectors}
    hasFlowAccess={hasFlowAccess}
  />
) : null}

<TrendTimingCard
  timing={
    hasFlowAccess && latestSnapshot?.alignmentReport
      ? (() => {
          const flowThemes = Array.isArray(communityTopSectors)
            ? communityTopSectors
                .map((x) =>
                  normalizeThemeName(
                    x?.label ||
                      x?.sector ||
                      x?.category ||
                      x?.name ||
                      x ||
                      ""
                  )
                )
                .filter(Boolean)
            : [];

          const currentTheme = getSnapshotTopTheme(latestSnapshot);

          const history = Array.isArray(snapshotHistory)
            ? snapshotHistory
                .filter((s) => s?.adminStatus !== "excluded")
                .slice()
                .sort(
                  (a, b) =>
                    getSnapshotDateValue(a) -
                    getSnapshotDateValue(b)
                )
            : [];

          if (!currentTheme || !flowThemes.length || history.length < 2) {
            return {
              label: "Developing",
              tone: "neutral",
              status: "Building history",
              narrative:
                "Sphere has a current signal, but needs more snapshot history before timing your behavior against Flow."
            };
          }

          const latestIndex = history.findIndex(
            (s) => s.id === latestSnapshot.id
          );

          const currentIndex =
            latestIndex >= 0 ? latestIndex : history.length - 1;

          const currentOverlapsFlow =
            flowThemes.includes(currentTheme);

          const firstFlowThemeIndex = history.findIndex((s) =>
            flowThemes.includes(getSnapshotTopTheme(s))
          );

          if (
            firstFlowThemeIndex >= 0 &&
            firstFlowThemeIndex < currentIndex
          ) {
            return {
              label: "Early Signal",
              tone: "good",
              status: "Before Flow",
              narrative:
                "A theme now visible in Flow appeared in your earlier snapshots first. Sphere reads this as evidence that you may have moved before the broader community signal became visible."
            };
          }

          if (currentOverlapsFlow) {
            return {
              label: "In Step",
              tone: "good",
              status: "With the crowd",
              narrative:
                "Your strongest current move overlaps with Flow. You appear to be moving alongside the broader community."
            };
          }

          return {
            label: "Independent Signal",
            tone: "neutral",
            status: "Different from Flow",
            narrative:
              "Your strongest current move is not one of Flow's leading themes. Sphere reads this as a distinct pattern that may become more meaningful as more history builds."
          };
        })()
      : null
  }
  hasFlowAccess={hasFlowAccess}
/>

<FlowConfidenceCard
  communityTopSectors={communityTopSectors}
  hasFlowAccess={hasFlowAccess}
/>

{hasFlowAccess ? (
  <Card>
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: UI.FONT_MUTED,
          fontWeight: 900
        }}
      >
        Flow Identity
      </div>

      <div style={{ fontSize: 28, fontWeight: 900, color: UI.PRIMARY }}>
        {flowIdentity.emoji} {flowIdentity.label}
      </div>

      <div style={{ fontSize: UI.FONT_BODY, fontWeight: 900 }}>
        {flowIdentity.traditional}
      </div>

      <div style={{ fontSize: UI.FONT_BODY, opacity: 0.9 }}>
        {flowIdentity.meaning}
      </div>
    </div>
  </Card>
) : null}

{hasFlowAccess ? (
  <FlowMarketAlignmentCard communityTopSectors={communityTopSectors} />
) : null}

{hasFlowAccess && flowExploreCard ? (
  <InsightCard
    eyebrow="Flow Explore"
    title={flowExploreCard.title}
    narrative={flowExploreCard.narrative}
    comparison={flowExploreCard.comparison}
    explore={flowExploreCard.explore}
    tone={flowExploreCard.tone}
    identity={flowIdentity}
  />
) : null}
    </div>
  );
}