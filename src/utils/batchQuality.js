export function scoreBatchQuality(normalizedTxs) {
  const total = normalizedTxs.length;

  const withDate = normalizedTxs.filter(t => t.postedDate).length;
  const withMerchant = normalizedTxs.filter(t => t.merchantNorm).length;
  const coherentSigns = normalizedTxs.filter(t => Math.abs(t.amount) > 0).length;

  const dateParseRate = withDate / total;
  const merchantNormRate = withMerchant / total;
  const signCoherence = coherentSigns / total;

  let riskScore = 0;
  if (dateParseRate < 0.95) riskScore += 0.3;
  if (merchantNormRate < 0.9) riskScore += 0.3;
  if (signCoherence < 0.9) riskScore += 0.2;

  return {
    dateParseRate,
    merchantNormRate,
    signCoherence,
    riskScore: Math.min(1, riskScore)
  };
}
