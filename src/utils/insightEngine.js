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