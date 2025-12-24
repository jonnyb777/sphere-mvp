function formatMoney(n) {
  return `$${Number(n).toFixed(2)}`;
}

// Optional simple mapping (mock) for “suggestions”
const merchantSuggestions = {
  amazon: "Suggestion: You shop Amazon a lot — consider tracking retail/commerce exposure (example: AMZN).",
  target: "Suggestion: Big Target spend — consider general retail exposure (example: TGT).",
  cvs: "Suggestion: CVS spending — consider healthcare/pharmacy exposure (example: CVS).",
  chipotle: "Suggestion: Dining spend — consider restaurant exposure (example: CMG)."
};

export default function MonthlyDrip({ transactions }) {
  if (!transactions || transactions.length === 0) {
    return <p style={{ marginTop: "1rem" }}>No transactions uploaded yet.</p>;
  }

  const spendMap = {};
  let totalSpend = 0;

  for (const tx of transactions) {
    const merchant = (tx.merchant || "Unknown").toString();
    const amount = Number(tx.amount) || 0;
    totalSpend += amount;
    spendMap[merchant] = (spendMap[merchant] || 0) + amount;
  }

  const ranked = Object.entries(spendMap)
    .map(([merchant, total]) => ({ merchant, total }))
    .sort((a, b) => b.total - a.total);

  const top3 = ranked.slice(0, 3);

  // Pick a suggestion based on top merchant (mock)
  const topMerchantKey = (top3[0]?.merchant || "").toLowerCase();
  const suggestion =
    merchantSuggestions[topMerchantKey] ||
    "Suggestion: Your top merchant can guide what sectors/companies to research next (mock suggestion for MVP).";

  return (
    <div style={{ marginTop: "1rem" }}>
      <h2>Monthly Drip</h2>

      <p>
        Total spend in uploaded data: <b>{formatMoney(totalSpend)}</b>
      </p>

      <p><b>Top 3 merchants</b></p>
      <ul>
        {top3.map((item) => (
          <li key={item.merchant}>
            {item.merchant}: {formatMoney(item.total)}{" "}
            ({totalSpend > 0 ? ((item.total / totalSpend) * 100).toFixed(1) : "0.0"}
            %)
          </li>
        ))}
      </ul>

      <p><b>Full ranked list</b></p>
      <ol>
        {ranked.map((item) => (
          <li key={item.merchant}>
            {item.merchant}: {formatMoney(item.total)}{" "}
            ({totalSpend > 0 ? ((item.total / totalSpend) * 100).toFixed(1) : "0.0"}
            %)
          </li>
        ))}
      </ol>

      <hr />

      <p><b>{suggestion}</b></p>
    </div>
  );
}
