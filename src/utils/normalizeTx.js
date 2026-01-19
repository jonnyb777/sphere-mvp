export function normalizeMerchant(name = "") {
  return String(name).toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
}

export function txHash({ date, merchant, amount, last4 = "" }) {
  const raw = `${date}|${normalizeMerchant(merchant)}|${Number(amount).toFixed(2)}|${last4}`;
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(raw))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""));
}

export function normalizeTx(tx, batchId, uid) {
  const date =
    tx.date ?? tx.Date ?? tx.posted_at ?? tx.PostedAt ?? tx.timestamp ?? tx.TransactionDate ?? null;

  const amount = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
  const merchant = tx.merchant ?? tx.Merchant ?? tx.name ?? tx.Name ?? "";

  return {
    uid,
    batchId,
    postedDate: date,
    amount,
    merchantNorm: normalizeMerchant(merchant),
    category: tx.category || "Other / Unmapped",
    type: amount < 0 ? "card_purchase" : "deposit",
    sensitive: false,
    createdAt: new Date().toISOString()
  };
}
