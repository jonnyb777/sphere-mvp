// FILE: src/components/DashboardSnapshot.jsx
import { useMemo } from "react";
import { UI, SummaryBand } from "./SectionUI";
import { Card } from "./ui/UiKit";
import { classifyMerchant } from "../utils/merchantSectorMap";
import InsightCard from "./InsightCard";

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

function buildDashboardFlags({ categoryRows, merchantRows, totalSpend, transactionCount }) {
  const flags = [];
  const topCategory = categoryRows[0];
  const topMerchant = merchantRows[0];

  if (!transactionCount) {
    return [
      {
        title: "No upload yet",
        body: "Upload transactions to generate your spending snapshot."
      }
    ];
  }

  if (topCategory?.pct >= 40) {
    flags.push({
      title: "Spending is concentrated",
      body: `${topCategory.category} makes up ${topCategory.pctRounded.toFixed(
        1
      )}% of mapped spending. That may be worth reviewing before comparing your activity to market sectors.`
    });
  }

  if (topMerchant && totalSpend > 0) {
    const merchantPct = (topMerchant.amount / totalSpend) * 100;
    if (merchantPct >= 25) {
      flags.push({
        title: "One merchant stands out",
        body: `${topMerchant.merchant} represents ${merchantPct.toFixed(
          1
        )}% of total spending in this upload.`
      });
    }
  }

  const subscriptionLike = merchantRows.filter((m) =>
    /netflix|spotify|google|microsoft|apple|hulu|prime|subscription/i.test(m.merchant)
  );

  if (subscriptionLike.length >= 2) {
    flags.push({
      title: "Recurring-style activity detected",
      body: `We found ${subscriptionLike.length} subscription-style merchants. These can be useful to track separately over time.`
    });
  }

  if (categoryRows.length >= 5) {
    flags.push({
      title: "Spending is spread across categories",
      body: `Your upload includes ${categoryRows.length} populated spend categories, which gives Sphere more context for Drip, Flow, and Alignment.`
    });
  }

  if (!flags.length) {
    flags.push({
      title: "No major flags yet",
      body: "Your uploaded spending does not show a strong concentration or obvious recurring pattern based on current thresholds."
    });
  }

  return flags;
}

function getExploreThemes(category = "") {
  const c = String(category || "").toLowerCase();

  if (/technology|subscription|e-commerce|retail/.test(c)) {
    return ["XLK", "cloud infrastructure", "consumer technology", "semiconductors"];
  }

  if (/grocery|pharmacies|utilities|insurance/.test(c)) {
    return ["XLP", "consumer staples", "healthcare access", "defensive sectors"];
  }

  if (/restaurants|travel|transportation/.test(c)) {
    return ["XLY", "consumer discretionary", "travel demand", "mobility trends"];
  }

  if (/gas|energy/.test(c)) {
    return ["XLE", "energy demand", "transportation costs", "commodity sensitivity"];
  }

  if (/financial|bank|credit/.test(c)) {
    return ["XLF", "consumer credit", "payment networks", "financial services"];
  }

  return ["SPY", "broad market", "consumer behavior", "sector rotation"];
}

function buildPrimaryInsightCard({ categoryRows, merchantRows, totalSpend, transactionCount }) {
  const topCategory = categoryRows[0];
  const topMerchant = merchantRows[0];

  if (!transactionCount || !topCategory) {
    return {
      title: "Your pattern will appear here",
      narrative:
        "Sphere turns each upload into a behavioral snapshot, then interprets the spending pattern behind the numbers.",
      comparison: "Upload transactions to generate your first market-context insight.",
      explore: ["SPY", "broad market", "consumer behavior"],
      tone: "calm"
    };
  }

  const category = String(topCategory.category || "");
  const top = category.toLowerCase();
  const explore = getExploreThemes(category);

  if (/technology|subscription|e-commerce|retail/.test(top)) {
    return {
      title: "Your activity leans digitally centered",
      narrative:
        "This snapshot suggests a pattern shaped by connected services, convenience, and technology-enabled daily activity.",
      comparison:
        "This does not mean those companies are automatic investments. It gives you a familiar starting point for understanding related market themes.",
      explore,
      tone: "calm"
    };
  }

  if (/grocery|pharmacies|utilities|insurance/.test(top)) {
    return {
      title: "Your activity leans stability-oriented",
      narrative:
        "This snapshot suggests a pattern anchored in essentials, coverage, and recurring household needs rather than discretionary exploration.",
      comparison:
        "Sphere reads this as a steadier, needs-based spending posture that can connect to defensive market themes.",
      explore,
      tone: "positive"
    };
  }

  if (/restaurants|travel|transportation/.test(top)) {
    return {
      title: "Your activity leans experience-oriented",
      narrative:
        "This snapshot suggests a pattern shaped by movement, meals, and real-world activity rather than purely digital or household spending.",
      comparison:
        "This can help you explore consumer demand, mobility, and discretionary market themes without treating spending as a buy signal.",
      explore,
      tone: "calm"
    };
  }

  if (categoryRows.length >= 5) {
    return {
      title: "Your snapshot shows a broad lifestyle mix",
      narrative:
        "This upload reflects spending across several areas, giving Sphere a wider behavioral picture to compare against market and Flow signals.",
      comparison:
        "A broader mix can make alignment and comparison insights more useful over time.",
      explore,
      tone: "positive"
    };
  }

  return {
    title: "Your current pattern is taking shape",
    narrative:
      "This upload gives Sphere an early read on the behavior behind your spending, but the signal will strengthen with cleaner or broader data.",
    comparison: `Total mapped spending in this snapshot: ${money(totalSpend)}.`,
    explore,
    tone: "calm"
  };
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
  hasFlowAccess = false,
  communityTopSectors = []
}) {
  const arr = useMemo(() => (Array.isArray(transactions) ? transactions : []), [transactions]);

  const categoryRows = useMemo(() => categoryTotalsFromTransactions(arr), [arr]);
  const merchantRows = useMemo(() => merchantTotalsFromTransactions(arr), [arr]);
  const topMerchant = merchantRows[0];

  const totalSpend = useMemo(() => {
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

  const primaryInsightCard = useMemo(
  () =>
    buildPrimaryInsightCard({
      categoryRows,
      merchantRows,
      totalSpend,
      transactionCount: arr.length
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
<InsightCard
  title={primaryInsightCard.title}
  narrative={primaryInsightCard.narrative}
  comparison={primaryInsightCard.comparison}
  explore={primaryInsightCard.explore}
  tone={primaryInsightCard.tone}
/>
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
    </div>
  );
}