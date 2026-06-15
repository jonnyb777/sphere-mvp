export function getExploreThemes(category = "") {
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

export function buildDripIdentity({ categoryRows = [] }) {
  const topCategory = categoryRows[0];
  const categoryCount = categoryRows.length;
  const topPct = Number(topCategory?.pct || 0);
  const topName = String(topCategory?.category || "").toLowerCase();

  if (!topCategory) {
    return {
      label: "Pattern forming",
      traditional: "Not enough data yet",
      meaning: "Upload activity to generate your first identity read.",
      emoji: "🫧"
    };
  }

  if (/technology|subscription|e-commerce|retail/.test(topName)) {
    return {
      label: "Surge",
      traditional: "Growth-oriented",
      meaning: "Innovation and changing habits",
      emoji: "🌊"
    };
  }

  if (/grocery|pharmacies|utilities|insurance/.test(topName)) {
    return {
      label: "Anchor",
      traditional: "Defensive",
      meaning: "Stability and essentials",
      emoji: "⚓"
    };
  }

  if (categoryCount >= 5 && topPct < 35) {
    return {
      label: "Surface",
      traditional: "Balanced",
      meaning: "Broad participation",
      emoji: "🫧"
    };
  }

  if (topPct >= 40) {
    return {
      label: "Stream",
      traditional: "Concentrated",
      meaning: "Focused priorities",
      emoji: "💧"
    };
  }

  return {
    label: "Surface",
    traditional: "Balanced",
    meaning: "Broad participation",
    emoji: "🫧"
  };
}

export function buildFlowIdentity({ communityTopSectors = [] }) {
  const sectors = Array.isArray(communityTopSectors)
    ? communityTopSectors.map((s) => String(s || "").toLowerCase())
    : [];

  const top = sectors[0] || "";
  const count = sectors.length;

  if (!top) {
    return {
      label: "Flow forming",
      traditional: "Not enough community context",
      meaning: "Flow identity appears once enough community activity is available.",
      emoji: "🌊"
    };
  }

  if (/technology|subscription|e-commerce|retail/.test(top)) {
    return {
      label: "Wave Maker",
      traditional: "Early adopter",
      meaning: "Ahead of the crowd",
      emoji: "🏄"
    };
  }

  if (/grocery|pharmacies|utilities|insurance|staples|healthcare/.test(top)) {
    return {
      label: "Calm Waters",
      traditional: "Defensive relative to the crowd",
      meaning: "Stable while others shift",
      emoji: "⚓"
    };
  }

  if (count >= 5) {
    return {
      label: "In the Flow",
      traditional: "Mainstream",
      meaning: "With the crowd",
      emoji: "🫧"
    };
  }

  return {
    label: "Crosscurrent",
    traditional: "Divergent",
    meaning: "Different from the crowd",
    emoji: "↔️"
  };
}

export function buildPrimaryInsightCard({
  categoryRows,
  merchantRows,
  totalSpend,
  transactionCount,
  money
}) {
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
  "Your spending behavior appears closely tied to connected services, convenience, and technology-enabled daily life.",
comparison:
  "Sphere reads this as your relationship to a broader digital-consumer movement — not as a buy signal, but as a starting point for market understanding.",
      explore,
      tone: "calm"
    };
  }

  if (/grocery|pharmacies|utilities|insurance/.test(top)) {
    return {
      title: "Your activity leans stability-oriented",
narrative:
  "Your spending behavior appears more connected to essentials, coverage, and recurring household needs than discretionary exploration.",
comparison:
  "Sphere reads this as a steadier relationship to the market — one that may align more with defensive and needs-based themes.",
      explore,
      tone: "positive"
    };
  }

  if (/restaurants|travel|transportation/.test(top)) {
    return {
      title: "Your activity leans experience-oriented",
narrative:
  "Your spending behavior appears more connected to movement, meals, and real-world activity than purely digital or household patterns.",
comparison:
  "Sphere reads this as your relationship to broader consumer demand and mobility themes — useful for orientation, not automatic investment decisions.",
      explore,
      tone: "calm"
    };
  }

  if (categoryRows.length >= 5) {
    return {
      title: "Your snapshot shows a broad lifestyle mix",
narrative:
  "Your spending behavior spans several areas, giving Sphere a wider view of how you participate in the consumer economy.",
comparison:
  "That broader footprint can make Alignment more useful because Sphere can compare where your behavior fits, diverges, or overlaps with wider patterns.",
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
export function buildDashboardFlags({
  categoryRows,
  merchantRows,
  totalSpend,
  transactionCount
}) {
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